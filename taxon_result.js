// Runs on iNaturalist taxa pages. After a batch item's form is saved, reports
// to the batch page whether the taxon was created (redirected to /taxa/<id>)
// or the save failed (the form is shown again with errors).
( ( ) => {
  const raw = sessionStorage.getItem( ITN.PENDING_KEY );
  if ( !raw ) return;
  if ( window.location.pathname.startsWith( "/taxa/new" ) ) return;

  let pending;
  try {
    pending = JSON.parse( raw );
  } catch ( e ) {
    sessionStorage.removeItem( ITN.PENDING_KEY );
    return;
  }
  const report = msg => ITN.ext.runtime.sendMessage( {
    type: "itn-result", batchId: pending.batchId, key: pending.key, ...msg
  } ).catch( ( ) => {} );

  // Only trust a taxon page reached by saving the form, not a later visit.
  const fromForm = /^https:\/\/www\.inaturalist\.org\/taxa(\/new)?([?#]|$)/.test( document.referrer );
  const created = window.location.pathname.match( /^\/taxa\/(\d+)/ );
  if ( created && fromForm ) {
    sessionStorage.removeItem( ITN.PENDING_KEY );
    report( { ok: true, taxonId: Number( created[1] ) } );
    return;
  }

  // A failed save re-renders the form at /taxa with error messages.
  if ( window.location.pathname === "/taxa" && document.getElementById( "taxon_name" ) ) {
    const errorEls = document.querySelectorAll(
      "#errorExplanation li, .errorExplanation li, .flash.error, #flash .error, .alert-danger"
    );
    const errors = [...errorEls].map( el => el.textContent.trim( ) ).filter( Boolean );
    const error = errors.length > 0 ? errors.join( "; " ) : "iNaturalist did not save the taxon";
    // In manual mode, keep the pending marker so a corrected re-save is
    // still reported.
    if ( pending.autoSubmit ) sessionStorage.removeItem( ITN.PENDING_KEY );
    report( { ok: false, error } );
  }
} )( );
