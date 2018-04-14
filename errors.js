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

module.exports = {
  convertFailToReject: convertFailToReject
};
