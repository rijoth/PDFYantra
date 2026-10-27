/**
 * Shared public copy.
 *
 * Keep these claims aligned with README.md, index.html, and metadata.json.
 * PDFYantra has no backend and no analytics, but it is not a PWA: the app still
 * needs the network to load. It also stores the workspace unencrypted in
 * IndexedDB, so avoid absolute claims about privacy or availability.
 */
export const PAGE_TITLE = 'PDFYantra - Private PDF Tools in Your Browser';

export const TAGLINE = 'Your PDFs never leave your device.';

export const LOCAL_PROCESSING = 'Processed locally in your browser.';

export const TRUST_NOTE =
    'PDFYantra processes files locally in your browser. Nothing is uploaded, and there are no accounts or tracking scripts. ' +
    'Your workspace is kept in your browser\'s local storage (IndexedDB) so it survives a refresh. ' +
    'It isn\'t encrypted, so use "Clear workspace" on shared computers.';

export const PASSWORD_NOTE =
    'The password is never stored or sent anywhere. The unlocked copy stays in your workspace as unencrypted, image-based pages until you clear it.';
