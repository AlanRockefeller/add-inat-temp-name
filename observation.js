// Runs on observation pages. Adds an "Add temp name" button to the
// Provisional Species Name and Species Name Override observation fields.
( ( ) => {
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
      .find( el => fieldName( el ) === ITN.TREE_FIELD );
    const valueEl = ofvEl && ofvEl.querySelector( ":scope > .value" );
    if ( !valueEl ) return null;
    const link = valueEl.querySelector( "a[href^='http']" );
    if ( link ) return link.href;
    return ITN.firstUrl( valueEl.textContent );
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

    const invalid = ITN.validateName( name );
    if ( invalid ) {
      setStatus( container, invalid, "error" );
      return;
    }
    const parentName = ITN.parentNameOf( name );

    button.disabled = true;
    setStatus( container, "Checking iNaturalist…" );
    try {
      const existing = await ITN.findExistingTaxon( name );
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
      const { parent, error } = await ITN.findParentTaxon( parentName );
      if ( !parent ) {
        setStatus( container, error, "error" );
        return;
      }
      const treeUrl = phylogeneticTreeUrl( );
      const payload = {
        name,
        parentName: parent.name,
        parentId: parent.id,
        comment: ITN.buildComment( [ITN.observationUrl( observationId( ) )], treeUrl ? [treeUrl] : [] )
      };
      const hash = `${ITN.HASH_KEY}=${encodeURIComponent( JSON.stringify( payload ) )}`;
      const formUrl = `https://www.inaturalist.org/taxa/new#${hash}`;
      // The API checks can outlast the click's user activation, in which case
      // the browser blocks the popup. Then offer a link, which is a fresh click.
      if ( window.open( formUrl, "_blank" ) ) {
        setStatus( container, "Opened new taxon form.", "ok" );
      } else {
        const status = container.querySelector( ".itn-status" );
        status.replaceChildren( "The browser blocked the new tab. ", Object.assign(
          document.createElement( "a" ),
          { href: formUrl, target: "_blank", textContent: "Open the new taxon form" }
        ) );
        status.className = "itn-status itn-error";
      }
    } catch ( e ) {
      setStatus( container, `Error: ${e.message}`, "error" );
    } finally {
      button.disabled = false;
    }
  }

  function decorate( ) {
    if ( !observationId( ) ) return;
    document.querySelectorAll( ".ObservationFieldValue" ).forEach( ofvEl => {
      if ( !ITN.NAME_FIELDS.includes( fieldName( ofvEl ) ) ) return;
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
