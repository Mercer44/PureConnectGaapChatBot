
/**
 * Determines whether an http status code is in the successful range (200-299).
 * @param {Number} statusCode The status code to check.
 * @returns {Boolean} true if the statusCode represents a success.
 */
exports.isSuccessStatus = function(statusCode){
    return ((statusCode >= 200) && (statusCode <= 299));
};

