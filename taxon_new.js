// Runs on https://www.inaturalist.org/taxa/new. If the page was opened by the
// observation-page button, fill in the new provisional taxon form.
( async ( ) => {
  const prefix = `#${ITN.HASH_KEY}=`;
  if ( !window.location.hash.startsWith( prefix ) ) return;

  let data;
  try {
    data = JSON.parse( decodeURIComponent( window.location.hash.slice( prefix.length ) ) );
  } catch ( e ) {
    return;
  }
  // Drop the hash so a reload doesn't re-run the automation.
  history.replaceState( null, "", window.location.pathname + window.location.search );

  const banner = document.createElement( "div" );
  banner.style.cssText = "position:fixed;top:10px;right:10px;z-index:10000;"
    + "padding:8px 12px;border-radius:4px;font:13px sans-serif;"
    + "background:#fff3cd;color:#333;border:1px solid #d6b656;max-width:360px;";
  document.body.appendChild( banner );
  const say = ( msg, ok ) => {
    banner.textContent = `Temp name: ${msg}`;
    if ( ok === true ) {
      banner.style.background = "#d4edda";
      banner.style.borderColor = "#6aa16f";
    } else if ( ok === false ) {
      banner.style.background = "#f8d7da";
      banner.style.borderColor = "#c0392b";
    }
  };
  const fail = msg => say( msg, false );

  const nameInput = document.getElementById( "taxon_name" );
  const rankSelect = document.getElementById( "taxon_rank" );
  const parentName = document.getElementById( "parent_name" );
  const parentId = document.getElementById( "taxon_parent_id" );
  const comment = document.getElementById( "taxon_audit_comment" );
  if ( !nameInput || !rankSelect || !parentName || !parentId ) {
    fail( "could not find the taxon form (are you logged in as a curator?)" );
    return;
  }

  const fire = ( el, type ) => el.dispatchEvent( new Event( type, { bubbles: true } ) );

  // Scientific name and rank
  nameInput.value = data.name;
  fire( nameInput, "input" );
  fire( nameInput, "change" );
  rankSelect.value = "species";
  fire( rankSelect, "change" );

  // Why are you making this change?
  if ( comment ) {
    comment.value = data.observationUrl
      + ( data.treeUrl ? `\n\nSee phylogenetic tree ${data.treeUrl}` : "" );
    fire( comment, "input" );
  }

  // Parent: wait for iNat's simpleTaxonSelector to wrap the input, then type
  // the parent name and click its Lookup button.
  say( `looking up parent ${data.parentName}…` );
  const lookupButton = await ITN.waitFor( ( ) => {
    const wrapper = parentName.closest( ".simpleTaxonSelector" );
    return wrapper && wrapper.querySelector( "input[type=button]" );
  } );
  if ( !lookupButton ) {
    fail( "parent lookup button not found" );
    return;
  }
  const wrapper = parentName.closest( ".simpleTaxonSelector" );
  parentName.value = data.parentName;
  lookupButton.click( );

  // Either the lookup auto-selects a single exact match, or it shows a list
  // of choices. In the latter case click the one linking to our parent ID.
  const parentIdStr = String( data.parentId );
  const selected = await ITN.waitFor( ( ) => {
    if ( parentId.value === parentIdStr ) return true;
    const viewLink = wrapper.querySelector( `ul.matches a[href="/taxa/${parentIdStr}"]` );
    const choice = viewLink && viewLink.closest( "li" ).querySelector( ".taxon" );
    if ( choice ) choice.click( );
    return false;
  } );
  if ( !selected ) {
    fail( `could not select parent ${data.parentName} (${parentIdStr}); please choose it manually` );
    return;
  }

  // The Provisional checkbox appears once iNat confirms the parent is in Fungi.
  say( "waiting for Provisional checkbox…" );
  const provisional = await ITN.waitFor( ( ) => {
    const field = document.getElementById( "provisional_field" );
    const box = document.getElementById( "taxon_provisional" );
    return field && box && field.style.display !== "none" ? box : null;
  } );
  if ( !provisional ) {
    fail( "Provisional checkbox did not appear (is the parent in Fungi?)" );
    return;
  }
  if ( !provisional.checked ) provisional.click( );

  say( "form filled in. Review it, then click Save Changes.", true );
  nameInput.scrollIntoView( { block: "center" } );
} )( );
