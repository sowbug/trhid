/**
 * Listens for the app launching, then creates the window.
 *
 * @see http://developer.chrome.com/apps/app.runtime.html
 * @see http://developer.chrome.com/apps/app.window.html
 */
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(
    "window-build.html",
    {
      id: "tpoc-window",
      outerBounds: { minWidth: 800, minHeight: 480 }
    }
  );
});
