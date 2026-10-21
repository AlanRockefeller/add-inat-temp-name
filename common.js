// Shared helpers for the iNat Add Temp Name extension.
const ITN = {
  // Key used in the taxa/new URL hash to pass data from the observation page.
  HASH_KEY: "inat-temp-name",

  // sessionStorage key marking a batch item whose form was submitted in this tab.
  PENDING_KEY: "inat-temp-name-pending",

  // Must match TaxonName::PROVISIONAL_NAME_FORMAT in the iNaturalist source.
  PROVISIONAL_NAME_FORMAT: /^[A-Z][a-z-]+\s+sp\.\s+'[A-Za-z0-9\- ]+'$/,

  FUNGI_ID: 47170,

  API: "https://api.inaturalist.org/v1",

  // Observation fields that hold the provisional name.
  NAME_FIELDS: ["provisional species name", "species name override"],

  TREE_FIELD: "phylogenetic tree",

  // Extension API namespace (Firefox: browser, Chrome: chrome).
  ext: typeof browser !== "undefined" ? browser : chrome,

  // Convert curly quotes to straight ones and collapse whitespace.
  normalizeName( name ) {
    return name
      .replace( /[‘’‚‛′`]/g, "'" )
      .replace( /\s+/g, " " )
      .trim( );
  },

  // Returns an error message if the name can't be a provisional name, else null.
  validateName( name ) {
    if ( !name.includes( "'" ) ) {
      return `"${name}" is not a provisional name (no single quote).`;
    }
    if ( !ITN.PROVISIONAL_NAME_FORMAT.test( name ) ) {
      return `"${name}" is not in the format Genus sp. 'epithet'.`;
    }
    return null;
  },

  parentNameOf( name ) {
    return name.split( " " )[0];
  },

  firstUrl( text ) {
    const m = ( text || "" ).match( /https?:\/\/[^\s<>"]+/ );
    return m ? m[0] : null;
  },

  observationUrl( id ) {
    return `https://www.inaturalist.org/observations/${id}`;
  },

  // Text for the "Why are you making this change?" box.
  buildComment( observationUrls, treeUrls ) {
    let comment = observationUrls.join( "\n" );
    if ( treeUrls.length > 0 ) {
      comment += `\n\n${treeUrls.map( url => `See phylogenetic tree ${url}` ).join( "\n" )}`;
    }
    return comment;
  },

  sleep( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) );
  },

  // Poll until fn() returns a truthy value or the timeout passes.
  async waitFor( fn, timeoutMs = 15000, intervalMs = 150 ) {
    const start = Date.now( );
    while ( Date.now( ) - start < timeoutMs ) {
      const result = fn( );
      if ( result ) return result;
      await ITN.sleep( intervalMs );
    }
    return null;
  },

  // GET from the iNat API, at most about one request per second as iNat asks.
  lastApiCall: 0,
  async apiGet( pathOrUrl ) {
    const wait = ITN.lastApiCall + 1000 - Date.now( );
    if ( wait > 0 ) await ITN.sleep( wait );
    ITN.lastApiCall = Date.now( );
    const url = pathOrUrl.startsWith( "http" ) ? pathOrUrl : `${ITN.API}${pathOrUrl}`;
    const resp = await fetch( url );
    if ( !resp.ok ) throw new Error( `iNat API returned ${resp.status}` );
    return resp.json( );
  },

  // Returns an existing taxon with exactly this name, or null.
  async findExistingTaxon( name ) {
    const data = await ITN.apiGet( `/taxa?is_active=any&per_page=30&q=${encodeURIComponent( name )}` );
    const lower = name.toLowerCase( );
    return data.results.find( t => t.name.toLowerCase( ) === lower ) || null;
  },

  // Returns { parent } for the parent taxon (exact name, above species rank,
  // active, within Fungi), or { error } explaining why there isn't one.
  // Provisional taxa must descend from Fungi, and iNat rejects an active
  // taxon under an inactive parent.
  async findParentTaxon( parentName ) {
    const data = await ITN.apiGet( `/taxa?is_active=any&per_page=30&q=${encodeURIComponent( parentName )}` );
    const lower = parentName.toLowerCase( );
    const fungal = data.results.filter( t => (
      t.name.toLowerCase( ) === lower
      && t.rank_level > 10
      && ( t.ancestor_ids || [] ).includes( ITN.FUNGI_ID )
    ) );
    const parent = fungal.find( t => t.is_active );
    if ( parent ) return { parent };
    if ( fungal.length > 0 ) {
      return { error: `Parent "${parentName}" is inactive on iNaturalist (taxon ${fungal[0].id}).` };
    }
    return { error: `Parent taxon "${parentName}" not found in Fungi on iNaturalist.` };
  }
};
