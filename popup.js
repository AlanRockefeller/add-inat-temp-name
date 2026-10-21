// Clicking the toolbar icon opens the batch page in a new tab.
ITN.ext.tabs.create( { url: ITN.ext.runtime.getURL( "batch.html" ) } ).then( ( ) => window.close( ) );
