# iNat Add Temp Name version 0.1 - Alan Rockefeller - October 21, 2026

A browser extension for Chrome and Firefox that makes it faster to add new provisional ("temp") fungal
names to the iNaturalist taxonomy, straight from an observation that needs a name created for it.

## Who it is for

This extension is for **iNaturalist curators who add temporary names for fungi**. These names are
provisional species names like `Pezizellaceae sp. 'HI01'` or `Russula sp. 'IN29'`, usually backed by a
DNA sequence.

You can only create taxa if your account is an iNaturalist curator. iNaturalist only allows
provisional taxa inside Kingdom Fungi. Anyone can install the extension, but the form it fills in
can only be saved by a curator.

## What it does

### On an observation page

On any observation page (`https://www.inaturalist.org/observations/<id>`), the extension adds an
**Add temp name** button under each of these observation fields:

- **Provisional Species Name**
- **Species Name Override**

To save time and API calls, the button always shows and does nothing until you click it. When you
click it, the extension:

1. **Checks the name format.** The name must contain a single quote and match iNaturalist's required
   format for provisional names, `Genus sp. 'epithet'`. The first word can also be a higher rank, such as a
   family (`Pezizellaceae sp. 'HI01'`). Curly quotes (`‘ ’`) are converted to straight quotes (`'`)
   first. If the name doesn't match, an error message appears next to the button and nothing else
   happens.
2. **Checks whether the name already exists** by searching the iNaturalist API. The search ignores
   upper and lower case and includes inactive taxa. If the name already exists, the button shows a link
   to that taxon instead.
3. **Looks up the parent taxon.** The parent is the first word of the name, for example `Pezizellaceae`. If
   more than one taxon has that name, it prefers an active one within Fungi. If no parent can be found,
   you get an error message.
4. **Opens a new tab** with the iNaturalist "Create New Taxon" form
   (`https://www.inaturalist.org/taxa/new`). The observation page stays open.

### On the new taxon form

The extension then fills in the form automatically:

| Field | Value |
| --- | --- |
| **Scientific Name** | The provisional name, e.g. `Pezizellaceae sp. 'HI01'` |
| **Rank** | `species` |
| **Parent Name** | The parent, e.g. `Pezizellaceae`. The extension clicks **Lookup**, then clicks the matching taxon in the results, e.g. *Family Pezizellaceae* |
| **Provisional** checkbox | Checked. This checkbox appears once iNaturalist confirms the parent is in Fungi |
| **Why are you making this change? (optional)** | The observation URL. If the observation has a URL in a **Phylogenetic Tree** field, it is followed by a blank line and `See phylogenetic tree <URL>` |

For example, the change comment might look like this:

```
https://www.inaturalist.org/observations/334924034

See phylogenetic tree https://example.org/tree.png
```

A small banner in the top-right corner shows progress. When it turns green, the form is ready. If a
step fails, the banner turns red and says which step failed. For example, it fails if the parent
couldn't be selected or the Provisional checkbox never appeared. You can then finish that step by
hand.

**The extension never clicks Save Changes.** Review the form, then save it yourself.

## How to use it

1. Log in to iNaturalist with your curator account.
2. Open an observation that has a **Provisional Species Name** or **Species Name Override** field,
   for example `Pezizellaceae sp. 'HI01'`.
3. Click **Add temp name** under the field.
   - If you see a link saying the name already exists, there is nothing to do.
   - If you see a red error, fix the field value. For example, it needs the form
     `Genus sp. 'epithet'`.
4. In the new tab, wait for the banner to turn green.
5. Check the filled-in form, then click **Save Changes**.

## Installation

The extension isn't in the Chrome Web Store or on Firefox Add-ons, so you install it from this folder.
First download or clone this folder to your computer.

### Chrome (and other Chromium browsers such as Edge, Brave, or Vivaldi)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. The extension stays installed after restarts. If you update the files, click the reload icon on
   the extension's card.

### Firefox

**Temporary install (quickest):**

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select the `manifest.json` file in this folder.
3. A temporary add-on is removed when Firefox restarts, so repeat these steps after each restart.

**Permanent install:** Firefox only permanently installs add-ons that Mozilla has signed. To sign it,
zip the contents of this folder. Upload the zip to <https://addons.mozilla.org/developers/> as an
**unlisted** add-on, which keeps it private. Then install the signed `.xpi` file you get back. Firefox
Developer Edition and Nightly can instead install unsigned add-ons, if you set
`xpinstall.signatures.required` to `false` in `about:config`.

## Permissions and privacy

The extension only runs on `www.inaturalist.org` observation pages and the new taxon page. It only
contacts `api.inaturalist.org`, to check names and look up parent taxa. It collects no data and sends
nothing anywhere else.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3, works in Chrome and Firefox) |
| `common.js` | Shared helpers: name normalization, the provisional name format, waiting utilities |
| `observation.js` | Adds the button on observation pages and runs the checks |
| `observation.css` | Styling for the button and status messages |
| `taxon_new.js` | Fills in the new taxon form |

## License

MIT. See [LICENSE](LICENSE). Release history is in [CHANGELOG.md](CHANGELOG.md).
