// Runs on observation pages. Adds an "Add temp name" button to the
// Provisional Species Name and Species Name Override observation fields.
( ( ) => {
  const FIELD_NAMES = ["provisional species name", "species name override"];
  const API = "https://api.inaturalist.org/v1";

  function observationId( ) {
    const m = window.location.pathname.match( /^\/observations\/(\d+)/ );
    return m ? m[1] : null;
  }

  function fieldName( ofvEl ) {
    const field = ofvEl.querySelector( ":scope > .field" );
    if ( !field ) return null;
    return field.textContent.replace( /:\s*$/, "" ).trim( ).toLowerCase( );
  }

  // Returns the first URL in the Phylogenetic Tree field, or null.
  function phylogeneticTreeUrl( ) {
    const ofvEl = [...document.querySelectorAll( ".ObservationFieldValue" )]
      .find( el => fieldName( el ) === "phylogenetic tree" );
    const valueEl = ofvEl && ofvEl.querySelector( ":scope > .value" );
    if ( !valueEl ) return null;
    const link = valueEl.querySelector( "a[href^='http']" );
    if ( link ) return link.href;
    const m = valueEl.textContent.match( /https?:\/\/\S+/ );
    return m ? m[0] : null;
  }

  async function apiGet( path ) {
    const resp = await fetch( `${API}${path}` );
    if ( !resp.ok ) throw new Error( `iNat API returned ${resp.status}` );
    return resp.json( );
  }

  // Returns an existing taxon with exactly this name, or null.
  async function findExistingTaxon( name ) {
    const data = await apiGet( `/taxa?is_active=any&per_page=30&q=${encodeURIComponent( name )}` );
    const lower = name.toLowerCase( );
    return data.results.find( t => t.name.toLowerCase( ) === lower ) || null;
  }

  // Returns the parent taxon (exact name, above species rank), preferring
  // active taxa within Fungi.
  async function findParentTaxon( parentName ) {
    const data = await apiGet( `/taxa?is_active=any&per_page=30&q=${encodeURIComponent( parentName )}` );
    const lower = parentName.toLowerCase( );
    const candidates = data.results.filter( t => (
      t.name.toLowerCase( ) === lower && t.rank_level > 10
    ) );
    const score = t => ( t.is_active ? 2 : 0 )
      + ( ( t.ancestor_ids || [] ).includes( ITN.FUNGI_ID ) ? 1 : 0 );
    candidates.sort( ( a, b ) => score( b ) - score( a ) );
    return candidates[0] || null;
  }

  function setStatus( container, message, kind ) {
    const status = container.querySelector( ".itn-status" );
    status.textContent = message;
    status.className = `itn-status${kind ? ` itn-${kind}` : ""}`;
  }

  async function handleClick( container, rawName ) {
    const button = container.querySelector( "button" );
    const name = ITN.normalizeName( rawName );
    setStatus( container, "" );

    if ( !name.includes( "'" ) ) {
      setStatus( container, `"${name}" is not a provisional name (no single quote).`, "error" );
      return;
    }
    if ( !ITN.PROVISIONAL_NAME_FORMAT.test( name ) ) {
      setStatus( container, `"${name}" is not in the format Genus sp. 'epithet'.`, "error" );
      return;
    }
    const parentName = name.split( " " )[0];

    button.disabled = true;
    setStatus( container, "Checking iNaturalist…" );
    try {
      const existing = await findExistingTaxon( name );
      if ( existing ) {
        container.querySelector( ".itn-status" ).innerHTML = "";
        const link = document.createElement( "a" );
        link.href = `/taxa/${existing.id}`;
        link.target = "_blank";
        link.textContent = `${existing.name} already exists (taxon ${existing.id})`;
        container.querySelector( ".itn-status" ).appendChild( link );
        container.querySelector( ".itn-status" ).className = "itn-status itn-ok";
        return;
      }
      const parent = await findParentTaxon( parentName );
      if ( !parent ) {
        setStatus( container, `Parent taxon "${parentName}" not found on iNaturalist.`, "error" );
        return;
      }
      const payload = {
        name,
        parentName: parent.name,
        parentId: parent.id,
        observationUrl: `https://www.inaturalist.org/observations/${observationId( )}`,
        treeUrl: phylogeneticTreeUrl( )
      };
      const hash = `${ITN.HASH_KEY}=${encodeURIComponent( JSON.stringify( payload ) )}`;
      window.open( `https://www.inaturalist.org/taxa/new#${hash}`, "_blank" );
      setStatus( container, "Opened new taxon form.", "ok" );
    } catch ( e ) {
      setStatus( container, `Error: ${e.message}`, "error" );
    } finally {
      button.disabled = false;
    }
  }

  function decorate( ) {
    if ( !observationId( ) ) return;
    document.querySelectorAll( ".ObservationFieldValue" ).forEach( ofvEl => {
      if ( !FIELD_NAMES.includes( fieldName( ofvEl ) ) ) return;
      if ( ofvEl.querySelector( ".itn-container" ) ) return;
      const valueEl = ofvEl.querySelector( ":scope > .value" );
      if ( !valueEl ) return;

      const container = document.createElement( "div" );
      container.className = "itn-container";
      const button = document.createElement( "button" );
      button.type = "button";
      button.className = "btn btn-default btn-xs itn-button";
      button.textContent = "Add temp name";
      button.title = "Create this provisional name on iNaturalist if it does not exist";
      const status = document.createElement( "span" );
      status.className = "itn-status";
      container.append( button, status );
      button.addEventListener( "click", e => {
        e.preventDefault( );
        e.stopPropagation( );
        // Read the value at click time in case it was edited.
        handleClick( container, valueEl.textContent );
      } );
      ofvEl.appendChild( container );
    } );
  }

  // The observation page is a React app, so fields render (and re-render)
  // after load. Watch for changes and add buttons as needed.
  let scheduled = false;
  const observer = new MutationObserver( ( ) => {
    if ( scheduled ) return;
    scheduled = true;
    requestAnimationFrame( ( ) => {
      scheduled = false;
      decorate( );
    } );
  } );
  observer.observe( document.body, { childList: true, subtree: true } );
  decorate( );
} )( );
