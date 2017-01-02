var _ = require('underscore');
var Promise = require('bluebird');

_.mixin({
  //
  // Retrieves a property value at a particular "path" into the object.
  //
  deepGet: function(object, path) {
    var props = path.split('.');
    return _.compose.apply(null, props.reverse().map(_.property))(object);
  }
});

//
// ValidationError is rejected from validation-related promises. If you catch one, inspect its
// .errors property to see which specific validations failed.
//
function ValidationError(errors) {
  this.message = "Validation error";
  this.name = "ValidationError";
  this.errors = errors;
}
ValidationError.prototype = Object.create(Error.prototype);

function rejectUnless(ok) {
  return ok ? Promise.resolve() : Promise.reject(new ValidationError());
}

//
// settleAll ensures that *all* of the passed promises either resolve or reject. Only *after* they
// do will the returned promise either resolve (if *all* resolved) or reject (if *any* rejected).
//
function settleAll(promises) {
  return Promise.all(promises.map(function(promise) {
      return promise.reflect();
    }))
    .reduce(function(rejections, inspection) {
      return rejections + inspection.isRejected() ? 1 : 0;
    }, 0)
    .then(function(rejections) {
      return rejections ? Promise.reject(new ValidationError()) : Promise.resolve();
    });
}

var Ratify = {
  //
  // Contains all of the validation methods. Use #addValidator to add some.
  //
  validators: {},

  //
  // This is the proper way to add a validation method, because it binds the passed function to
  // the .validators object. We do this to ensure validation methods can leverage one another
  // (e.g. max, min, and between are all built on numericality).
  //
  addValidator: function(name, fn) {
    this.validators[name] = _.bind(fn, this.validators);
  },

  //
  // Returns a function that takes (attrs, attrName), runs the `valName` validator (configured with
  // the passed options) and returns a promise.
  //
  // The returned promise from that function rejects with a ValidatioNError if the validator fails.
  // Check the ValidationError's .errors property to see the name of the failing validator.
  //
  // Validators returned from this function probably aren't useful on their own -- they run a
  // single validation method against a single attribute -- but they're the building blocks of the
  // entire module (see #getAttributeValidator);
  //
  // Parameters:
  // - valName (string): Name of the validation method powering the validator
  // - options (object): Configuration options passed to the validation method
  //
  getValidator: function(valName, options) {
    var _validate = this.validators[valName](options);

    return function validate(attrs, attrName) {
      return _validate(attrs, attrName)
        .catch(ValidationError, function(e) {
          var errors = e.errors || {};
          errors[valName] = true;
          return Promise.reject(new ValidationError(errors));
        });
    };
  },

  //
  // Returns a function that takes (attrs, attrName), runs *all* validators specified in `rules`,
  // and returns a promise.
  //
  // The returned promise rejects with a ValidationError if *any* of the validators fails. Check
  // the ValidationError's .errors property to discover which of the individual validators failed.
  //
  // Validators returned from this function may be used to ensure that a single value meets all
  // necessary validation criteria -- e.g. email is present AND looks like an email address. By
  // combining attribute validators, we can validate entire objects (see #getModelValidator).
  //
  // Parameters:
  // - rules (object): Validators named as keys are configured with options passed as values; e.g.
  //   {acceptance: true, numericality: {onlyInteger: true}}
  //
  getAttributeValidator: function(rules) {
    var errors = {};
    var validators = _.map(rules, function(options, valName) {
      return this.getValidator(valName, options);
    }.bind(this));

    return function validateAttribute(attrs, attrName) {
      var promises = _.map(validators, function(validator) {
        return validator(attrs, attrName)
          .catch(ValidationError, function(e) {
            _.extend(errors, e.errors);
            return Promise.reject(e);
          });
      });
      return settleAll(promises)
        .catch(ValidationError, function(e) {
          return Promise.reject(new ValidationError(errors));
        });
    };
  },

  //
  // Returns a function that takes (attrs, attrName), runs validators specified in `rules`,
  // and returns a promise.
  //
  // The returned promise rejects with a ValidationError if *any* of the validators fails. Check
  // the ValidationError's .errors property to discover which of the individual validators failed.
  //
  // Parameters:
  // - rules (object): Validators named as keys are configured with options passed as values; e.g.
  //   {acceptance: true, numericality: {onlyInteger: true}}
  //
  getModelValidator: function(attrRules) {
    var errors = {};
    var attrValidators = _.mapObject(attrRules, function(rules, attrName) {
      return this.getAttributeValidator(rules);
    }.bind(this));

    return function validateModel(attrs, attrNames) {
      var attrValidatorsToRun = _.pick(attrValidators, attrNames || _.keys(attrRules));
      var promises = _.map(attrValidatorsToRun, function(validators, attrName) {
        return validators(attrs, attrName)
          .catch(ValidationError, function(e) {
            errors[attrName] = e.errors;
            return Promise.reject(e);
          });
      });
      return settleAll(promises)
        .catch(ValidationError, function(e) {
          return Promise.reject(new ValidationError(errors));
        });
    };
  }
};
_.bindAll(Ratify, 'addValidator', 'getValidator', 'getAttributeValidator', 'getModelValidator');

//
// Most of the built-in validators are modeled after ActiveModel, and are meant to provide a solid
// set of "building blocks" for other validators.
//
// - absence
// - acceptance
// - confirmation
// - exclusion
// - format
// - inclusion
// - length
// - numericality
// - presence
//
var builtInValidators = {
  //
  // acceptance validator
  // Validates that attrs[attrName] has a value that can be considered to mean "accepted".
  //
  // Options:
  // - accept: array of values considered "accepted" (default: [true, 'true', 1, '1'])
  //
  acceptance: function(acceptance) {
    var options = _.defaults(_.isObject(acceptance) ? acceptance : {}, {accept: [true, 'true', 1, '1']});
    return this.inclusion({in: options.accept});
  },

  //
  // confirmation validator
  // Validates that attrs[attrName] equals attrs[confirmation] (the attribute being confirmed).
  // e.g. confirmation({...}, 'passwordConfirmation', 'password')
  //
  confirmation: function(attrToConfirm) {
    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);
      var otherValue = _.deepGet(attrs, attrToConfirm);
      return rejectUnless(value == otherValue);
    }.bind(this);
  },

  //
  // exclusion validator
  // Validates that attrs[attrName] is not found in the exclusion set.
  //
  // Parameters:
  // - exclusion (array or options object)
  //   Passing an array is shorthand for passing {in: <that-array>}.
  //
  // Options:
  // - in (array): Reject if the value is found in this array
  //
  exclusion: function(exclusion) {
    var options = (_.isArray(exclusion) ? {in: exclusion} : exclusion) || {};

    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);
      var set = options.in || [];
      return rejectUnless(!_.contains(set, value));
    }.bind(this);
  },

  //
  // format validator
  // Validates that attrs[attrName] does/doesn't match particular regular expressions.
  //
  // Parameters:
  // - format (RegExp or options object)
  //   Passing an array is shorthand for passing {with: <that-regexp>}.
  //
  // Options:
  // - with (RegExp): Reject if the value doesn't match this format
  // - without (RegExp): Reject if the value matches this format
  //
  format: function(format) {
    var options = _.isRegExp(format) ? {with: format} : format || {};

    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);

      var pass = true;
      if(pass && _.has(options, 'with')) {
        pass = options.with.test(value);
      }
      if(pass && _.has(options, 'without')) {
        pass = !options.without.test(value);
      }

      return rejectUnless(pass);
    }.bind(this);
  },

  //
  // inclusion validator
  // Validates that attrs[attrName] is found in the inclusion set.
  //
  // Parameters:
  // - inclusion (array or options object)
  //   Passing an array is shorthand for passing {in: <that-array>}.
  //
  // Options:
  // - in (array): Reject if the value is not found in this array
  //
  inclusion: function(inclusion) {
    var options = (_.isArray(inclusion) ? {in: inclusion} : inclusion) || {};

    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);
      var set = options.in || [];

      return rejectUnless(_.contains(set, value));
    }.bind(this);
  },

  //
  // length validator
  // Validates the length of attrs[attrName].
  //
  // Parameters:
  // - length (number, two-number array, or options object)
  //   Passing a number is shorthand for passing {is: <that-number>}.
  //   Passing an array is shorthand for passing {range: <that-array>}.
  //
  // Options:
  // - is (number): Reject unless value has this exact length
  // - minimum (number): Reject unless value is at least this long
  // - minimum (number): Reject unless value is at most this long
  // - range (array): Reject unless value length is between these values, inclusive
  //
  length: function(length) {
    var options = (_.isNumber(length) ? {is: length} : (_.isArray(length) ? {range: length} : length)) || {};

    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);

      var pass = _.isString(value);
      if(pass && _.has(options, 'is')) {
        pass = value.length === options.is;
      }
      if(pass && _.has(options, 'minimum')) {
        pass = value.length >= options.minimum;
      }
      if(pass && _.has(options, 'maximum')) {
        pass = value.length <= options.maximum;
      }
      if(pass && _.has(options, 'range')) {
        pass = (value.length >= options.range[0] && value.length <= options.range[1]);
      }

      return rejectUnless(pass);
    }.bind(this);
  },

  //
  // numericality validator
  // Validates the numericality of attrs[attrName].
  //
  // Options:
  // - greaterThan (number): Reject unless the value is greater than this number
  // - greaterThanOrEqualTo (number): Reject unless the value is at least this number
  // - equalTo (number): Reject unless the value equals this number
  // - lessThanOrEqualTo (number): Reject unless the value is at most this number
  // - lessThan (number): Reject unless the value is less than this number
  // - otherThan (number): Reject if the value equals this number
  // - onlyInteger (boolean): Reject unless the value is an integer
  // - even (boolean): Reject unless the value is even
  // - odd (boolean): Reject unless the value is odd
  //
  numericality: function(options) {
    options = options || {};

    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);

      var pass = (_.isNumber(value) || _.isString(value) && value.match(/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/));
      if(pass && _.has(options, 'greaterThan')) {
        pass = value > options.greaterThan;
      }
      if(pass && _.has(options, 'greaterThanOrEqualTo')) {
        pass = value >= options.greaterThanOrEqualTo;
      }
      if(pass && _.has(options, 'equalTo')) {
        pass = value == options.equalTo;
      }
      if(pass && _.has(options, 'lessThanOrEqualTo')) {
        pass = value <= options.lessThanOrEqualTo;
      }
      if(pass && _.has(options, 'lessThan')) {
        pass = value < options.lessThan;
      }
      if(pass && _.has(options, 'otherThan')) {
        pass = value != options.otherThan;
      }
      if(pass && options.onlyInteger) {
        pass = !isNaN(value) && parseInt(Number(value)) == value && !isNaN(parseInt(value,10));
      }
      if(pass && options.even) {
        pass = (value % 2) === 0;
      }
      if(pass && options.odd) {
        pass = (value % 2) === 1;
      }

      return rejectUnless(pass);
    }.bind(this);
  },

  //
  // presence validator
  // Validates that attrs[attrName] is neither null, undefined, a blank string, nor an empty array.
  //
  presence: function(presence) {
    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);
      var fail = presence && (_.isNull(value) || _.isUndefined(value) || (_.isString(value) && value.match(/^\s*$/)) || (_.isArray(value) && _.isEmpty(value)));
      return rejectUnless(!fail);
    }.bind(this);
  },

  //
  // absence validator
  // Validates that attrs[attrName] is either null, undefined, a blank string, or an empty array.
  //
  absence: function(absence) {
    return function(attrs, attrName) {
      var value = _.deepGet(attrs, attrName);
      var fail = absence && !(_.isNull(value) || _.isUndefined(value) || (_.isString(value) && value.match(/^\s*$/)) || (_.isArray(value) && _.isEmpty(value)));
      return rejectUnless(!fail);
    }.bind(this);
  }
};

// Add the built-in validators the same way users will add them.
_.each(builtInValidators, function(name, fn) {
  Ratify.addValidator(fn, name);
});

var backboneValidateValidators = {
  //
  // equalTo validator
  // Alias of #confirmation.
  //
  equalTo: function(equalTo) {
    return this.confirmation(equalTo);
  },

  //
  // max validator
  // Validates that attrs[attrName] is not greater than a certain number.
  //
  max: function(max) {
    return this.numericality({lessThanOrEqualTo: max});
  },

  //
  // maxLength validator
  // Validates that the length of attrs[attrName] is at most n characters.
  //
  // Parameters:
  // - maxLength (number): Reject if the value's length is greater than this number
  //
  maxLength: function(maxLength) {
    return this.length({maximum: maxLength});
  },

  //
  // min validator
  // Validates that attrs[attrName] is not less than a certain number.
  //
  min: function(min) {
    return this.numericality({greaterThanOrEqualTo: min});
  },

  //
  // minLength validator
  // Validates that the length of attrs[attrName] is at least n characters.
  //
  // Parameters:
  // - minLength (number): Reject if the value's length is less than this number
  //
  minLength: function(minLength) {
    return this.length({minimum: minLength});
  },

  //
  // oneOf validator
  // Alias of #inclusion.
  //
  oneOf: function(oneOf) {
    return this.inclusion({in: oneOf});
  },

  //
  // pattern validator
  // Alias of #format.
  //
  pattern: function(pattern) {
    return this.format({with: pattern});
  },

  //
  // range validator
  // Validates that attrs[attrName] is between the first and second numbers in an array, inclusive.
  //
  range: function(range) {
    return this.numericality({greaterThanOrEqualTo: range[0], lessThanOrEqualTo: range[1]});
  },

  //
  // rangeLength validator
  // Validates that attrs[attrName]'s length is between the first and second numbers in an array, inclusive.
  //
  rangeLength: function(range) {
    return this.length({minimum: range[0], maximum: range[1]});
  },

  //
  // required validator
  // Alias of #presence.
  //
  required: function(required) {
    return this.presence(required);
  }
};

// Add the Backbone.Validation validators the same way users will add them.
_.each(backboneValidateValidators, function(name, fn) {
  Ratify.addValidator(fn, name);
});

module.exports = Ratify;
