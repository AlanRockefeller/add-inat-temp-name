// Batch page: load observations, review the provisional names they contain,
// then create the missing ones one after another in a separate form window.
( ( ) => {
  const $ = id => document.getElementById( id );
  const MAX_SEARCH_RESULTS = 1000;
  const AUTO_TIMEOUT_MS = 90000;
  const AUTO_DELAY_MS = 2000;
  const INPUT_STORAGE_KEY = "itn-batch-input";
  const SELECTABLE = ["ready", "failed"];

  let items = [];
  let checking = false;
  // State of the current Start run, or null.
  let run = null;

  try {
    $( "input" ).value = localStorage.getItem( INPUT_STORAGE_KEY ) || "";
  } catch ( e ) { /* storage unavailable */ }
  $( "input" ).addEventListener( "input", ( ) => {
    try {
      localStorage.setItem( INPUT_STORAGE_KEY, $( "input" ).value );
    } catch ( e ) { /* storage unavailable */ }
  } );

  function el( tag, props = {}, children = [] ) {
    const node = document.createElement( tag );
    Object.assign( node, props );
    node.append( ...children );
    return node;
  }

  function link( href, text ) {
    return el( "a", { href, textContent: text, target: "_blank", rel: "noopener" } );
  }

  // ---- Input parsing and loading ----

  function parseInput( text ) {
    const ids = new Set( );
    const searches = [];
    const unknown = [];
    text.split( /[\s,]+/ ).filter( Boolean ).forEach( token => {
      if ( /^\d+$/.test( token ) ) {
        ids.add( token );
        return;
      }
      let url;
      try {
        url = new URL( token );
      } catch ( e ) {
        unknown.push( token );
        return;
      }
      const m = url.pathname.match( /\/observations\/(\d+)/ );
      if ( m ) {
        ids.add( m[1] );
      } else if ( /\/observations(\/identify)?\/?$/.test( url.pathname ) ) {
        searches.push( url.searchParams );
      } else {
        unknown.push( token );
      }
    } );
    return { ids: [...ids], searches, unknown };
  }

  async function fetchObservations( { ids, searches }, progress ) {
    const observations = new Map( );
    const notes = [];
    for ( let i = 0; i < ids.length; i += 200 ) {
      const chunk = ids.slice( i, i + 200 );
      progress( `Loading observations ${i + 1}–${i + chunk.length} of ${ids.length}…` );
      const data = await ITN.apiGet( `/observations?id=${chunk.join( "," )}&per_page=200` );
      data.results.forEach( o => observations.set( o.id, o ) );
    }
    for ( const searchParams of searches ) {
      const params = new URLSearchParams( searchParams );
      ["page", "per_page", "subview", "view"].forEach( k => params.delete( k ) );
      params.set( "per_page", "200" );
      let total = 0;
      let fetched = 0;
      for ( let page = 1; fetched < MAX_SEARCH_RESULTS; page += 1 ) {
        params.set( "page", String( page ) );
        progress( `Loading search results (${fetched} so far)…` );
        const data = await ITN.apiGet( `/observations?${params}` );
        total = data.total_results;
        data.results.forEach( o => observations.set( o.id, o ) );
        fetched += data.results.length;
        if ( data.results.length < 200 || fetched >= total ) break;
      }
      if ( total > fetched ) {
        notes.push( `A search matched ${total} observations; only the first ${fetched} were loaded.` );
      }
    }
    const missing = ids.filter( id => !observations.has( Number( id ) ) );
    if ( missing.length > 0 ) {
      notes.push( `Not found (deleted or private?): ${missing.join( ", " )}` );
    }
    return { observations: [...observations.values( )], notes };
  }

  function fieldValues( observation, fieldName ) {
    return ( observation.ofvs || [] )
      .filter( f => ( f.name || "" ).trim( ).toLowerCase( ) === fieldName && f.value )
      .map( f => String( f.value ) );
  }

  // One item per unique name (case-insensitive), listing every observation
  // that has it.
  function buildItems( observations ) {
    const byKey = new Map( );
    const noName = [];
    observations.sort( ( a, b ) => a.id - b.id ).forEach( o => {
      const names = new Set( ITN.NAME_FIELDS.flatMap( f => fieldValues( o, f ) ).map( ITN.normalizeName ) );
      if ( names.size === 0 ) {
        noName.push( o.id );
        return;
      }
      const treeUrls = fieldValues( o, ITN.TREE_FIELD ).map( ITN.firstUrl ).filter( Boolean );
      names.forEach( name => {
        const key = name.toLowerCase( );
        if ( !byKey.has( key ) ) {
          byKey.set( key, {
            key, name, obsIds: [], treeUrls: [], status: "checking", message: "Checking…", selected: false
          } );
        }
        const item = byKey.get( key );
        if ( !item.obsIds.includes( o.id ) ) item.obsIds.push( o.id );
        treeUrls.forEach( url => {
          if ( !item.treeUrls.includes( url ) ) item.treeUrls.push( url );
        } );
      } );
    } );
    return { items: [...byKey.values( )], noName };
  }

  async function checkItems( ) {
    const parents = new Map( );
    for ( const item of items ) {
      const invalid = ITN.validateName( item.name );
      if ( invalid ) {
        setStatus( item, "invalid", invalid );
        continue;
      }
      try {
        const existing = await ITN.findExistingTaxon( item.name );
        if ( existing ) {
          item.taxonId = existing.id;
          setStatus( item, "exists", "Already exists" );
          continue;
        }
        const parentName = ITN.parentNameOf( item.name );
        const parentKey = parentName.toLowerCase( );
        if ( !parents.has( parentKey ) ) {
          parents.set( parentKey, await ITN.findParentTaxon( parentName ) );
        }
        const parent = parents.get( parentKey );
        if ( !parent ) {
          setStatus( item, "noparent", `Parent "${parentName}" not found on iNaturalist` );
          continue;
        }
        item.parent = parent;
        item.selected = true;
        setStatus( item, "ready", "Ready" );
      } catch ( e ) {
        setStatus( item, "error", `Error: ${e.message}` );
      }
    }
  }

  $( "load" ).addEventListener( "click", async ( ) => {
    const parsed = parseInput( $( "input" ).value );
    if ( parsed.ids.length === 0 && parsed.searches.length === 0 ) {
      $( "loadStatus" ).textContent = "Enter at least one observation number, observation URL or search URL.";
      return;
    }
    checking = true;
    updateControls( );
    $( "results" ).hidden = true;
    try {
      const { observations, notes } = await fetchObservations(
        parsed, msg => { $( "loadStatus" ).textContent = msg; }
      );
      if ( parsed.unknown.length > 0 ) {
        notes.unshift( `Ignored (not an observation or search URL): ${parsed.unknown.join( " " )}` );
      }
      const built = buildItems( observations );
      items = built.items;
      $( "noName" ).textContent = [
        ...notes,
        built.noName.length > 0
          ? `${built.noName.length} observation(s) have no Provisional Species Name or Species Name Override: ${built.noName.join( ", " )}`
          : ""
      ].filter( Boolean ).join( "\n" );
      renderTable( );
      $( "results" ).hidden = false;
      $( "loadStatus" ).textContent = `Loaded ${observations.length} observation(s). Checking names…`;
      await checkItems( );
      $( "loadStatus" ).textContent = `Loaded ${observations.length} observation(s).`;
    } catch ( e ) {
      $( "loadStatus" ).textContent = `Error: ${e.message}`;
    } finally {
      checking = false;
      updateControls( );
    }
  } );

  // ---- Table ----

  function renderTable( ) {
    const tbody = $( "rows" );
    tbody.replaceChildren( );
    items.forEach( item => {
      item.checkbox = el( "input", { type: "checkbox" } );
      item.checkbox.addEventListener( "change", ( ) => {
        item.selected = item.checkbox.checked;
        updateControls( );
      } );
      item.parentCell = el( "td" );
      item.statusCell = el( "td" );
      item.row = el( "tr", {}, [
        el( "td", {}, [item.checkbox] ),
        el( "td", { textContent: item.name } ),
        item.parentCell,
        el( "td", { className: "obs" }, item.obsIds.map( id => link( ITN.observationUrl( id ), String( id ) ) ) ),
        el( "td", { className: "tree" }, item.treeUrls.map( ( url, i ) => link( url, `tree ${i + 1}` ) ) ),
        item.statusCell
      ] );
      tbody.append( item.row );
      renderItem( item );
    } );
    updateControls( );
  }

  function renderItem( item ) {
    item.checkbox.checked = item.selected;
    item.parentCell.replaceChildren( item.parent
      ? link( `https://www.inaturalist.org/taxa/${item.parent.id}`, `${item.parent.rank} ${item.parent.name}` )
      : "" );
    const status = el( "span", { className: `st-${item.status}`, textContent: item.message } );
    item.statusCell.replaceChildren( status );
    if ( item.taxonId ) {
      item.statusCell.append( " ", link( `https://www.inaturalist.org/taxa/${item.taxonId}`, `taxon ${item.taxonId}` ) );
    }
  }

  function setStatus( item, status, message ) {
    item.status = status;
    item.message = message;
    if ( !SELECTABLE.includes( status ) ) item.selected = false;
    if ( item.row ) renderItem( item );
    updateControls( );
  }

  function updateSummary( ) {
    const counts = {};
    items.forEach( i => { counts[i.status] = ( counts[i.status] || 0 ) + 1; } );
    const labels = {
      ready: "ready",
      created: "created",
      exists: "already exist",
      failed: "failed",
      invalid: "bad format",
      noparent: "parent not found",
      error: "errors",
      skipped: "skipped",
      checking: "checking",
      working: "in progress"
    };
    const parts = Object.keys( labels ).filter( k => counts[k] ).map( k => `${counts[k]} ${labels[k]}` );
    $( "summary" ).textContent = `${items.length} name(s): ${parts.join( ", " )}`;
  }

  function updateControls( ) {
    const busy = checking || !!run;
    $( "load" ).disabled = busy;
    const selectable = items.filter( i => SELECTABLE.includes( i.status ) );
    items.forEach( i => {
      if ( i.checkbox ) i.checkbox.disabled = busy || !SELECTABLE.includes( i.status );
    } );
    $( "selectAll" ).disabled = busy || selectable.length === 0;
    $( "selectAll" ).checked = selectable.length > 0 && selectable.every( i => i.selected );
    const selectedCount = selectable.filter( i => i.selected ).length;
    $( "start" ).disabled = busy || selectedCount === 0;
    $( "start" ).textContent = selectedCount > 0 ? `Start (${selectedCount})` : "Start";
    $( "autoCreate" ).disabled = !!run;
    $( "stop" ).hidden = !run;
    $( "skip" ).hidden = !run || run.auto;
    updateSummary( );
  }

  $( "selectAll" ).addEventListener( "change", ( ) => {
    items.forEach( i => {
      if ( SELECTABLE.includes( i.status ) ) i.selected = $( "selectAll" ).checked;
      if ( i.row ) renderItem( i );
    } );
    updateControls( );
  } );

  // ---- Creating taxa ----

  async function openForm( item ) {
    const payload = {
      batchId: run.batchId,
      key: item.key,
      autoSubmit: run.auto,
      name: item.name,
      parentName: item.parent.name,
      parentId: item.parent.id,
      comment: ITN.buildComment( item.obsIds.map( ITN.observationUrl ), item.treeUrls )
    };
    // The query parameter makes every URL distinct so the tab always reloads.
    const url = `https://www.inaturalist.org/taxa/new?itn=${Date.now( )}`
      + `#${ITN.HASH_KEY}=${encodeURIComponent( JSON.stringify( payload ) )}`;
    if ( run.tabId != null ) {
      try {
        await ITN.ext.tabs.update( run.tabId, { url } );
        return;
      } catch ( e ) {
        run.tabId = null;
      }
    }
    const win = await ITN.ext.windows.create( { url, type: "popup", width: 1100, height: 900 } );
    run.windowId = win.id;
    run.tabId = win.tabs[0].id;
  }

  // Resolves with the outcome reported by taxon_new.js / taxon_result.js,
  // or when the user skips, stops, or (auto mode) the timeout passes.
  function waitForResult( item ) {
    return new Promise( resolve => {
      let timer = null;
      const done = result => {
        clearTimeout( timer );
        run.waiter = null;
        resolve( result );
      };
      run.waiter = { key: item.key, done };
      if ( run.auto ) {
        timer = setTimeout( ( ) => done( {
          ok: false,
          error: "Timed out waiting for iNaturalist. Check whether the taxon was created before retrying."
        } ), AUTO_TIMEOUT_MS );
      }
    } );
  }

  ITN.ext.runtime.onMessage.addListener( msg => {
    if ( !msg || msg.type !== "itn-result" || !run || msg.batchId !== run.batchId ) return;
    const { waiter } = run;
    if ( !waiter || waiter.key !== msg.key ) return;
    if ( msg.ok || run.auto ) {
      waiter.done( msg );
    } else {
      // Manual mode: the user can fix the form and save again.
      setStatus( run.current, "working",
        `Save failed: ${msg.error}. Fix it in the form window and save again, or click Skip.` );
    }
  } );

  ITN.ext.windows.onRemoved.addListener( windowId => {
    if ( !run || windowId !== run.windowId ) return;
    run.windowId = null;
    run.tabId = null;
    run.stopped = true;
    if ( run.waiter ) run.waiter.done( { stopped: true } );
  } );

  // If iNat sends the form window to its login page, stop instead of waiting.
  ITN.ext.tabs.onUpdated.addListener( ( tabId, changeInfo ) => {
    if ( !run || tabId !== run.tabId || !changeInfo.url ) return;
    let path;
    try {
      path = new URL( changeInfo.url ).pathname;
    } catch ( e ) {
      return;
    }
    if ( /^\/(login|users\/sign_in|session)/.test( path ) ) {
      run.stopped = true;
      run.notLoggedIn = true;
      if ( run.waiter ) run.waiter.done( { stopped: true } );
    }
  } );

  $( "skip" ).addEventListener( "click", ( ) => {
    if ( run && run.waiter ) run.waiter.done( { skipped: true } );
  } );

  $( "stop" ).addEventListener( "click", ( ) => {
    if ( !run ) return;
    run.stopped = true;
    if ( run.waiter ) run.waiter.done( { stopped: true } );
  } );

  $( "start" ).addEventListener( "click", async ( ) => {
    const queue = items.filter( i => i.selected && SELECTABLE.includes( i.status ) );
    if ( queue.length === 0 ) return;
    const auto = $( "autoCreate" ).checked;
    if ( auto && !window.confirm(
      `Create ${queue.length} provisional taxa on iNaturalist automatically, without reviewing each form?`
    ) ) return;

    run = {
      batchId: crypto.randomUUID( ), auto, windowId: null, tabId: null, stopped: false, waiter: null, current: null
    };
    updateControls( );
    let created = 0;
    let failed = 0;
    let skipped = 0;
    for ( const [index, item] of queue.entries( ) ) {
      if ( run.stopped ) break;
      run.current = item;
      item.row.classList.add( "current" );
      item.row.scrollIntoView( { block: "nearest" } );
      $( "runStatus" ).textContent = `${index + 1} of ${queue.length}: ${item.name}`;
      setStatus( item, "working", auto ? "Creating…" : "Waiting for you to click Save Changes in the form window…" );
      let result;
      try {
        const resultPromise = waitForResult( item );
        await openForm( item );
        result = await resultPromise;
      } catch ( e ) {
        if ( run.waiter ) run.waiter.done( {} );
        result = { ok: false, error: e.message };
      }
      item.row.classList.remove( "current" );
      if ( result.stopped && run.notLoggedIn ) {
        setStatus( item, "ready", "Ready" );
        break;
      }
      if ( result.stopped ) {
        setStatus( item, "skipped",
          "Stopped before a result came back. Load the observations again to re-check this name." );
        break;
      }
      if ( result.skipped ) {
        skipped += 1;
        setStatus( item, "skipped", "Skipped" );
      } else if ( result.ok ) {
        created += 1;
        item.taxonId = result.taxonId;
        setStatus( item, "created", "Created" );
      } else {
        failed += 1;
        setStatus( item, "failed", `Failed: ${result.error}` );
        if ( result.fatal ) {
          run.stopped = true;
          break;
        }
      }
      if ( auto && index < queue.length - 1 && !run.stopped ) await ITN.sleep( AUTO_DELAY_MS );
    }

    if ( auto && run.windowId != null && !run.notLoggedIn ) {
      ITN.ext.windows.remove( run.windowId ).catch( ( ) => {} );
    }
    const stopped = run.notLoggedIn
      ? "Stopped: you are not logged in to iNaturalist. Log in (in the form window) and click Start again. "
      : run.stopped ? "Stopped. " : "Done. ";
    $( "runStatus" ).textContent = `${stopped}Created ${created}, failed ${failed}, skipped ${skipped}.`
      + ( failed > 0 ? " Failed names stay selected; click Start to retry them." : "" );
    run = null;
    updateControls( );
  } );
} )( );
