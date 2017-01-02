/* jshint -W030 */

var _ = require('underscore');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;

var Promise = require('bluebird');
var Ratify = require('../index');
var ValidationError = Ratify.ValidationError;

function toString(value) {
  if(_.isUndefined(value)) return 'undefined';
  if(_.isNull(value)) return 'null';
  if(_.isString(value)) return "'" + value + "'";
  if(value === 0 && (1/value < 0)) return '-0';
  return '' + value;
}

// Dummy validator for testing inline validation rules
function fortyTwo(attrs, attrName) {
  return attrs[attrName] === 42 ? Promise.resolve() : Promise.reject(new ValidationError());
}

describe('Underscore mixins', function() {
  describe('#deepGet', function() {
    var deepGet = _.deepGet;

    it('returns a value if the path is valid', function() {
      return expect(deepGet({a: {b: {c: 42}}}, 'a.b.c')).to.equal(42);
    });

    it('returns undefined if the path is invalid', function() {
      return expect(deepGet({}, 'foo')).to.be.undefined;
    });
  });
});

describe('Ratify', function() {
  describe('single built-in validator', function() {
    var validator = Ratify.getValidator('presence', true);

    it('is returned from #getValidator', function() {
      return expect(validator).to.be.a('function');
    });

    it('resolves upon success', function() {
      return expect(validator({a: 1}, 'a')).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({}, 'a')).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({presence: true});
    });
  });

  describe('single inline validator', function() {
    var validator = Ratify.getValidator('fortyTwo', fortyTwo);

    it('is returned from #getValidator', function() {
      return expect(validator).to.be.a('function');
    });

    it('resolves upon success', function() {
      return expect(validator({a: 42}, 'a')).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({a: 'not 42'}, 'a')).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({fortyTwo: true});
    });
  });

  describe('attribute validator', function() {
    var rules = {
      presence: true,
      numericality: true,
      fortyTwo: fortyTwo // inline
    };
    var validator = Ratify.getAttributeValidator(rules);

    it('is returned from #getAttributeValidator', function() {
      return expect(validator).to.be.a('function');
    });

    it('resolves upon success', function() {
      return expect(validator({a: 42}, 'a')).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({}, 'a')).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({presence: true, numericality: true, fortyTwo: true});
    });
  });

  describe('model validator', function() {
    var attrRules = {
      username: {presence: true},
      password: {presence: true, minLength: 5},
      email: {format: /\w+@\w+/},
      answer: {fortyTwo: fortyTwo} // inline
    };
    var validator = Ratify.getModelValidator(attrRules);

    it('is returned from #getModelValidator', function() {
      return expect(validator).to.be.a('function');
    });

    it('resolves upon success', function() {
      return expect(validator({username: 'foo', password: 'asdf123', email: 'foo@bar.com', answer:42})).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({username: 'foo', password: 'hi', email: 'blah', answer: 123})).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({password: {minLength: true}, email: {format: true}, answer: {fortyTwo: true}});
    });
  });

  describe('built in validation methods', function() {
    describe('#absence', function() {
      context('(true)', function() {
        var validate = Ratify.validators.absence(true);

        it('rejects when passed ({a: "foo"}, "a")', function() {
          return expect(validate({a: 'foo'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({}, "a")', function() {
          return expect(validate({}, 'a')).to.eventually.be.resolved;
        });

        _.each([null, undefined, '', ' '], function(value) {
          it('resolves when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.resolves;
          });
        });
      });

      context('(false)', function() {
        var validate = Ratify.validators.absence(false);

        it('resolves when passed ({a: "foo"}, "a")', function() {
          return expect(validate({a: 'foo'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({}, "a")', function() {
          return expect(validate({}, 'a')).to.eventually.be.resolved;
        });

        _.each([null, undefined, '', ' '], function(value) {
          it('resolves when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.resolved;
          });
        });
      });
    });

    describe('#acceptance', function() {
      context('()', function() {
        var validate = Ratify.validators.acceptance();

        [true, 'true', 1, '1'].forEach(function(value) {
          it('resolves when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.resolved;
          });
        });

        [false, 'false', 0, -0, '', ' ', null, undefined, NaN].forEach(function(value) {
          it('rejects when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.rejected;
          });
        });
      });

      context("({accept: 'foo'})", function() {
        var validate = Ratify.validators.acceptance({accept: 'foo'});

        it('resolves when passed ({a: "foo"}, "a")', function() {
          return expect(validate({a: "foo"}, "a")).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: true}, "a")', function() {
          return expect(validate({a: true}, "a")).to.eventually.be.rejected;
        });
      });
    });

    describe('#confirmation', function() {
      context("('password')", function() {
        var validate = Ratify.validators.confirmation('password');

        it('resolves when passed ({password: "foo", again: "foo"}, "again")', function() {
          return expect(validate({password: "foo", again: "foo"}, 'again')).to.eventually.be.resolved;
        });

        it('rejects when passed ({password: "foo", again: "bar"}, "again")', function() {
          return expect(validate({password: "foo", again: "bar"}, 'again')).to.eventually.be.rejected;
        });
      });
    });

    describe('#exclusion', function() {
      context('([1,2,3])', function() {
        var validate = Ratify.validators.exclusion([1,2,3]);

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 4}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({in: [1,2,3]})', function() {
        var validate = Ratify.validators.exclusion({in: [1,2,3]});

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 4}, 'a')).to.eventually.be.resolved;
        });
      });
    });

    describe('#format', function() {
      context('(/bar/)', function() {
        var validate = Ratify.validators.format({with: /bar/});

        it('resolves when passed ({a: "foobarbaz"}, "a")', function() {
          return expect(validate({a: 'foobarbaz'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "quxquxqux"}, "a")', function() {
          return expect(validate({a: 'quxquxqux'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({with: /bar/})', function() {
        var validate = Ratify.validators.format({with: /bar/});

        it('resolves when passed ({a: "foobarbaz"}, "a")', function() {
          return expect(validate({a: 'foobarbaz'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "quxquxqux"}, "a")', function() {
          return expect(validate({a: 'quxquxqux'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({without: /qux/})', function() {
        var validate = Ratify.validators.format({without: /qux/});

        it('resolves when passed ({a: "foobarbaz"}, "a")', function() {
          return expect(validate({a: 'foobarbaz'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "quxquxqux"}, "a")', function() {
          return expect(validate({a: 'quxquxqux'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({with: /bar/, without: /qux/})', function() {
        var validate = Ratify.validators.format({with: /bar/, without: /qux/});

        it('resolves when passed ({a: "foobarbaz"}, "a")', function() {
          return expect(validate({a: 'foobarbaz'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "quxquxqux"}, "a")', function() {
          return expect(validate({a: 'quxquxqux'}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: "barquxbar"}, "a")', function() {
          return expect(validate({a: 'barquxbar'}, 'a')).to.eventually.be.rejected;
        });
      });
    });

    describe('#inclusion', function() {
      context('([1,2,3])', function() {
        var validate = Ratify.validators.inclusion([1,2,3]);

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 4}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({in: [1,2,3]})', function() {
        var validate = Ratify.validators.inclusion({in: [1,2,3]});

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 4}, 'a')).to.eventually.be.rejected;
        });
      });
    });

    describe('#length', function() {
      context('(3)', function() {
        var validate = Ratify.validators.length(3);

        it('rejects when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('([3,4])', function() {
        var validate = Ratify.validators.length([3,4]);

        it('rejects when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "55555"}, "a")', function() {
          return expect(validate({a: '55555'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({range: [3,4]})', function() {
        var validate = Ratify.validators.length({range: [3,4]});

        it('rejects when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "55555"}, "a")', function() {
          return expect(validate({a: '55555'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({minimum: 3})', function() {
        var validate = Ratify.validators.length({minimum: 3});

        it('rejects when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({maximum: 3})', function() {
        var validate = Ratify.validators.length({maximum: 3});

        it('resolves when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({is: 3})', function() {
        var validate = Ratify.validators.length({is: 3});

        it('rejects when passed ({a: "22"}, "a")', function() {
          return expect(validate({a: '22'}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: "333"}, "a")', function() {
          return expect(validate({a: '333'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: "4444"}, "a")', function() {
          return expect(validate({a: '4444'}, 'a')).to.eventually.be.rejected;
        });
      });
    });

    describe('#numericality', function() {
      context('()', function() {
        var validate = Ratify.validators.numericality();

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: 123.45}, "a")', function() {
          return expect(validate({a: 123.45}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "1"}, "a")', function() {
          return expect(validate({a: "1"}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "123.45"}, "a")', function() {
          return expect(validate({a: "123.45"}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({greaterThan: 1})', function() {
        var validate = Ratify.validators.numericality({greaterThan: 1});

        it('rejects when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({greaterThanOrEqualTo: 1})', function() {
        var validate = Ratify.validators.numericality({greaterThanOrEqualTo: 1});

        it('rejects when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({equalTo: 1})', function() {
        var validate = Ratify.validators.numericality({equalTo: 1});

        it('rejects when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({lessThanOrEqualTo: 1})', function() {
        var validate = Ratify.validators.numericality({lessThanOrEqualTo: 1});

        it('resolves when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({lessThan: 1})', function() {
        var validate = Ratify.validators.numericality({lessThan: 1});

        it('resolves when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({otherThan: 1})', function() {
        var validate = Ratify.validators.numericality({otherThan: 1});

        it('resolves when passed ({a: 0}, "a")', function() {
          return expect(validate({a: 0}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('resolves when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.resolved;
        });
      });

      context('({onlyInteger: true})', function() {
        var validate = Ratify.validators.numericality({onlyInteger: true});

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "1"}, "a")', function() {
          return expect(validate({a: "1"}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 123.45}, "a")', function() {
          return expect(validate({a: 123.45}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: "123.45"}, "a")', function() {
          return expect(validate({a: "123.45"}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({even: true})', function() {
        var validate = Ratify.validators.numericality({even: true});

        it('resolves when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "2"}, "a")', function() {
          return expect(validate({a: "2"}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: "1"}, "a")', function() {
          return expect(validate({a: "1"}, 'a')).to.eventually.be.rejected;
        });
      });

      context('({odd: true})', function() {
        var validate = Ratify.validators.numericality({odd: true});

        it('resolves when passed ({a: 1}, "a")', function() {
          return expect(validate({a: 1}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({a: "1"}, "a")', function() {
          return expect(validate({a: "1"}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({a: 2}, "a")', function() {
          return expect(validate({a: 2}, 'a')).to.eventually.be.rejected;
        });

        it('rejects when passed ({a: "2"}, "a")', function() {
          return expect(validate({a: "2"}, 'a')).to.eventually.be.rejected;
        });
      });
    });

    describe('#presence', function() {
      context('(true)', function() {
        var validate = Ratify.validators.presence(true);

        it('resolves when passed ({a: "foo"}, "a")', function() {
          return expect(validate({a: 'foo'}, 'a')).to.eventually.be.resolved;
        });

        it('rejects when passed ({}, "a")', function() {
          return expect(validate({}, 'a')).to.eventually.be.rejected;
        });

        _.each([null, undefined, '', ' '], function(value) {
          it('rejects when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.rejected;
          });
        });
      });

      context('(false)', function() {
        var validate = Ratify.validators.presence(false);

        it('resolves when passed ({a: "foo"}, "a")', function() {
          return expect(validate({a: 'foo'}, 'a')).to.eventually.be.resolved;
        });

        it('resolves when passed ({}, "a")', function() {
          return expect(validate({}, 'a')).to.eventually.be.resolved;
        });

        _.each([null, undefined, '', ' '], function(value) {
          it('resolves when passed ({a: ' + toString(value) + '}, "a")', function() {
            return expect(validate({a: value}, 'a')).to.eventually.be.resolved;
          });
        });
      });
    });
  });

  describe('Backbone.Validation methods', function() {
    describe('#equalTo', function() {
      context("('password')", function() {
        it("proxies #confirmation with argument 'password'", function() {
          var confirmation = sinon.stub(Ratify.validators, 'confirmation').returns('foo');
          var result = Ratify.validators.equalTo('password');
          sinon.restore(Ratify.validators, 'confirmation');
          expect(result).to.equal('foo');
          return expect(confirmation.calledWithExactly('password')).to.be.true;
        });
      });
    });

    describe('#max', function() {
      context('(42)', function() {
        it('proxies #numericality with options {lessThanOrEqualTo: 42}', function() {
          var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
          var result = Ratify.validators.max(42);
          sinon.restore(Ratify.validators, 'numericality');
          expect(result).to.equal('foo');
          return expect(numericality.calledWithExactly({lessThanOrEqualTo: 42})).to.be.true;
        });
      });
    });

    describe('#maxLength', function() {
      context('(42)', function() {
        it('proxies #length with options {maximum: 42}', function() {
          var length = sinon.stub(Ratify.validators, 'length').returns('foo');
          var result = Ratify.validators.maxLength(42);
          sinon.restore(Ratify.validators, 'length');
          expect(result).to.equal('foo');
          return expect(length.calledWithExactly({maximum: 42})).to.be.true;
        });
      });
    });

    describe('#minLength', function() {
      context('(42)', function() {
        it('proxies #length with options {minimum: 42}', function() {
          var length = sinon.stub(Ratify.validators, 'length').returns('foo');
          var result = Ratify.validators.minLength(42);
          sinon.restore(Ratify.validators, 'length');
          expect(result).to.equal('foo');
          return expect(length.calledWithExactly({minimum: 42})).to.be.true;
        });
      });
    });

    describe('#min', function() {
      context('(42)', function() {
        it('proxies #numericality with options {greaterThanOrEqualTo: 42}', function() {
          var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
          var result = Ratify.validators.min(42);
          sinon.restore(Ratify.validators, 'numericality');
          expect(result).to.equal('foo');
          return expect(numericality.calledWithExactly({greaterThanOrEqualTo: 42})).to.be.true;
        });
      });
    });

    describe('#oneOf', function() {
      context('([1, 2, 3])', function() {
        it('proxies #inclusion with options {in: [1, 2, 3]}', function() {
          var inclusion = sinon.stub(Ratify.validators, 'inclusion').returns('foo');
          var result = Ratify.validators.oneOf([1, 2, 3]);
          sinon.restore(Ratify.validators, 'inclusion');
          expect(result).to.equal('foo');
          return expect(inclusion.calledWithExactly({in: [1, 2, 3]})).to.be.true;
        });
      });
    });

    describe('#pattern', function() {
      context('(/foo/)', function() {
        it('proxies #format with options {with: /foo/}', function() {
          var format = sinon.stub(Ratify.validators, 'format').returns('foo');
          var result = Ratify.validators.pattern(/foo/);
          sinon.restore(Ratify.validators, 'format');
          expect(result).to.equal('foo');
          return expect(format.calledWithExactly({with: /foo/})).to.be.true;
        });
      });
    });

    describe('#range', function() {
      context('([1, 10])', function() {
        it('proxies #numericality with options {greaterThanOrEqualTo: 1, lessThanOrEqualTo: 10}', function() {
          var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
          var result = Ratify.validators.range([1, 10]);
          sinon.restore(Ratify.validators, 'numericality');
          expect(result).to.equal('foo');
          return expect(numericality.calledWithExactly({greaterThanOrEqualTo: 1, lessThanOrEqualTo: 10})).to.be.true;
        });
      });
    });

    describe('#rangeLength', function() {
      context('([1, 10])', function() {
        it('proxies #length with options {minimum: 1, maximum: 10}', function() {
          var length = sinon.stub(Ratify.validators, 'length').returns('foo');
          var result = Ratify.validators.rangeLength([1, 10]);
          sinon.restore(Ratify.validators, 'length');
          expect(result).to.equal('foo');
          return expect(length.calledWithExactly({minimum: 1, maximum: 10})).to.be.true;
        });
      });
    });

    describe('#required', function() {
      context('(true)', function() {
        it('proxies #presence with argument true', function() {
          var presence = sinon.stub(Ratify.validators, 'presence').returns('foo');
          var result = Ratify.validators.required(true);
          sinon.restore(Ratify.validators, 'presence');
          expect(result).to.equal('foo');
          return expect(presence.calledWithExactly(true)).to.be.true;
        });
      });
    });
  });
});
