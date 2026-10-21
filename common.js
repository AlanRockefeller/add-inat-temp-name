// Shared helpers for the iNat Add Temp Name extension.
const ITN = {
  // Key used in the taxa/new URL hash to pass data from the observation page.
  HASH_KEY: "inat-temp-name",

  // Must match TaxonName::PROVISIONAL_NAME_FORMAT in the iNaturalist source.
  PROVISIONAL_NAME_FORMAT: /^[A-Z][a-z-]+\s+sp\.\s+'[A-Za-z0-9\- ]+'$/,

  FUNGI_ID: 47170,

  // Convert curly quotes to straight ones and collapse whitespace.
  normalizeName( name ) {
    return name
      .replace( /[‘’‚‛′`]/g, "'" )
      .replace( /\s+/g, " " )
      .trim( );
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
  }
};
