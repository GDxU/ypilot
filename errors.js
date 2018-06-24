const $ = require('jquery');

// convert a jQuery Deferred fail() from an XHR to a reject() of a Promise
function convertFailToReject(textStatus, errorThrown, reject) {
  if (errorThrown instanceof Error) {
    reject(errorThrown);
  } else if ('string' == typeof errorThrown) {
    reject(new Error(textStatus + ' ' + errorThrown));
  } else {
    reject(new Error(textStatus));
  }
}

// convert any kind of error to a string, with a stack trace if possible
function errorToString(error) {
  if (('object' == typeof error) && error !== null && ('message' in error)) {
    return error.message + ((('stack' in error) && error.stack != '') ? "\nStack trace:\n" + error.stack : '');
  } else {
    return "" + error;
  }
}

function reportError(error, context) {
  if (('object' == typeof error) && error !== null && ('context' in error)) {
    context = (context || '') + error.context;
  }
  var pre = $(document.createElement('pre'));
  pre.text((context || '') + errorToString(error));
  var hr = document.createElement('hr');
  $('#error-messages').append(pre, hr);
  $('#error-popup').show();
}

$(function() {
  $('#hide-error').on('click', evt => {
    $('#error-messages').empty();
    $('#error-popup').hide();
  });
});

// add context to an error message that reportError will pick up, and rethrow it
function rethrowError(error, context) {
  error.context = (context || '') + (error.context || '');
  throw error;
}

module.exports = {
  convertFailToReject: convertFailToReject,
  errorToString: errorToString,
  reportError: reportError,
  rethrowError: rethrowError
};
