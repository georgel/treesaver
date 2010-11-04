/**
 * @fileoverview Proxy for HTML5 window history functions for browsers that
 * do not support it.
 */

goog.provide('treesaver.history');

goog.require('treesaver.capabilities');
goog.require('treesaver.debug');
goog.require('treesaver.scheduler');
goog.require('treesaver.storage');

/**
 * Milliseconds between checks for hash changes on browsers that don't
 * support onhashchange
 *
 * @const
 * @type {number}
 */
treesaver.history.HASH_INTERVAL = 100;

/**
 * Hash prefix used to mark a hash generated by this library
 *
 * @const
 * @type {string}
 */
treesaver.history.DELIMITER = '-';

/**
 * Does the browser have a native implementation of the history functions
 * @const
 * @private
 * @type {boolean}
 */
treesaver.history.NATIVE_SUPPORT = 'pushState' in window.history;

/**
 * Return the value of the current document hash, minus any leading '#'
 * @private
 * @return {string} The normalized hash value.
 */
treesaver.history.getNormalizedHash_ = function() {
  var hash = document.location.hash;
  return hash.charAt(0) === '#' ? hash.substring(1) : hash;
};

// Even if the client has a native implementation of the API, we have to check
// the hash on load just in case the visitor followed a link generated by a
// browser that does not have native support
if (document.location.hash) {
  var current_hash = treesaver.history.getNormalizedHash_();

  // Our hashes always start with the delimiter and have at least another
  // character there
  if (current_hash.charAt(0) === treesaver.history.DELIMITER &&
      current_hash.length >= 2) {
    // Redirect, stripping the intial delimiter
    // Use location.replace instead of setting document.location to avoid
    // breaking the back button
    document.location.replace(current_hash.substr(1));
  }
}

/**
  * Proxy function for window.history.pushState
  *
  * @param {!Object} data
  * @param {!string} title
  * @param {!string} url
  */
treesaver.history.pushState = function(data, title, url) {
  window.history['pushState'](data, title, url);
};

/**
  * Proxy function for window.history.replaceState
  *
  * @param {!Object} data
  * @param {!string} title
  * @param {!string} url
  */
treesaver.history.replaceState = function(data, title, url) {
  window.history['replaceState'](data, title, url);
};

// History helper functions only needed for browsers that don't
// have native support
if (!treesaver.history.NATIVE_SUPPORT) {
  treesaver.debug.info('Using non-native history implementation');

  // Override functions for browsers with non-native support
  treesaver.history.pushState = function(data, title, url) {
    treesaver.history._changeState(data, title, url, false);
  };
  treesaver.history.replaceState = function(data, title, url) {
    treesaver.history._changeState(data, title, url, true);
  };

  /**
   * Create a hash for a given URL
   *
   * @private
   * @param {!string} url
   * @return {string} String that can be safely used as hash.
   */
  treesaver.history.createHash_ = function(url) {
    // Always add delimiter and escape the URL
    return treesaver.history.DELIMITER + window.escape(url);
  };

  /**
   * Storage prefix for history items
   *
   * @const
   * @private
   * @type {string}
   */
  treesaver.history.STORAGE_PREFIX = 'history:';

  /**
   * Create key name for storing history data
   *
   * @private
   * @param {!string} key
   * @return {string} String that can be safely used as storage key.
   */
  treesaver.history.createStorageKey_ = function(key) {
    return treesaver.history.STORAGE_PREFIX + key;
  };

  /**
   * @private
   * @param {?Object} data
   * @param {?string} title
   * @param {!string} url
   * @param {boolean} replace
   */
  treesaver.history._changeState = function _changeState(data, title, url, replace) {
    var hash_url = treesaver.history.createHash_(url);

    // Store data using url
    treesaver.storage.set(
      treesaver.history.createStorageKey_(hash_url),
      { state: data, title: title }
    );

    // If we're using the same URL as the current page, don't double up
    if (url === document.location.pathname) {
      hash_url = '';
    }

    // HTML5 implementation only calls popstate as a result of a user action,
    // store the hash so we don't trigger a false event
    treesaver.history.hash = hash_url;

    // Use the URL as a hash
    if (replace) {
      document.location.replace('#' + hash_url);
    }
    else {
      // TODO: IE 6 & 7 need to use iFrame for back button support

      // Place the hash normally
      document.location.hash = '#' + hash_url;
    }
  };

  /**
   * Receive the hashChanged event (native or manual) and fire the onpopstate
   * event
   * @private
   */
  treesaver.history.hashChange_ = function hashChange_() {
    var new_hash = treesaver.history.getNormalizedHash_(),
        data;

    // False alarm, ignore
    if (new_hash === treesaver.history.hash) {
      return;
    }

    treesaver.history.hash = new_hash;
    data = treesaver.history.hash ?
      treesaver.storage.get(treesaver.history.createStorageKey_(new_hash)) :
      {};

    treesaver.debug.info('New hash: ' + treesaver.history.hash);

    // Now, fire onpopstate with the state object
    if ('onpopstate' in window &&
        typeof window['onpopstate'] === 'function') {
      window['onpopstate'].apply(window, [{ 'state': data ? data.state : null }]);
    }
    else {
      treesaver.debug.info('State changed, but no handler!');
    }
  };

  // IE8 in IE7 mode defines onhashchange, but never fires it
  if ('onhashchange' in window && !treesaver.capabilities.IS_IE8INIE7) {
    treesaver.debug.info('Browser has native onHashChange');

    window['onhashchange'] = treesaver.history.hashChange_;
  }
  else {
    // TODO:
    // IE6 & 7 don't create history items if the hash doesn't match an
    // element's ID so we need to create an iframe which we'll use

    treesaver.debug.info('Using manual hash change detection');

    // Need to check hash state manually
    treesaver.scheduler.repeat(function() {
      var hash = treesaver.history.getNormalizedHash_();
      if (hash !== treesaver.history.hash) {
        treesaver.history.hashChange_();
      }
    }, treesaver.history.HASH_INTERVAL, Infinity);
  }
}
