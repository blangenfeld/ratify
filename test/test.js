/* jshint -W030 */

var _ = require('underscore');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;

var Ratify = require('../index');
var ValidationError = Ratify.ValidationError;

function toString(value) {
  if(_.isUndefined(value)) return 'undefined';
  if(_.isNull(value)) return 'null';
  if(_.isString(value)) return "'" + value + "'";
  if(value === 0 && (1/value < 0)) return '-0';
  return '' + value;
}

describe('Ratify', function() {
  describe('single validator', function() {
    var validator = Ratify.getValidator('presence', true);

    it('is returned from #getValidator', function() {
      expect(validator).to.be.a('function');
    });

    it('returns a resolving promise upon success', function() {
      return expect(validator({a: 1}, 'a')).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({}, 'a')).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({presence: true});
    });
  });

  describe('attribute validator', function() {
    var rules = {
      presence: true,
      numericality: true
    };
    var validator = Ratify.getAttributeValidator(rules);

    it('is returned from #getAttributeValidator', function() {
      expect(validator).to.be.a('function');
    });

    it('returns a resolving promise upon success', function() {
      return expect(validator({a: 1}, 'a')).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({}, 'a')).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({presence: true, numericality: true});
    });
  });

  describe('model validator', function() {
    var attrRules = {
      username: {presence: true},
      password: {presence: true, minLength: 5},
      email: {format: /\w+@\w+/},
    };
    var validator = Ratify.getModelValidator(attrRules);

    it('is returned from #getModelValidator', function() {
      expect(validator).to.be.a('function');
    });

    it('returns a resolving promise upon success', function() {
      return expect(validator({username: 'foo', password: 'asdf123', email: 'foo@bar.com'})).to.eventually.be.resolved;
    });

    it('returns a promise rejecting with a descriptive ValidationError upon failure', function() {
      return expect(validator({username: 'foo', password: 'hi', email: 'blah'})).to.eventually.be.rejectedWith(ValidationError)
        .and.have.property('errors')
        .to.deep.equal({password: {minLength: true}, email: {format: true}});
    });
  });

  describe('built in validation methods', function() {
    describe('#absence', function() {
      var absence = Ratify.validators.absence;

      it('returns a rejecting promise when passed ({a: "foo"}, "a", true)', function() {
        return expect(absence({a: 'foo'}, 'a', true)).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", false)', function() {
        return expect(absence({a: 'foo'}, 'a', false)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({}, "a", false)', function() {
        return expect(absence({}, 'a', false)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({}, "a", true)', function() {
        return expect(absence({}, 'a', true)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: null}, "a", true)', function() {
        return expect(absence({a: null}, 'a', true)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: undefined}, "a", true)', function() {
        return expect(absence({a: undefined}, 'a', true)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: ""}, "a", true)', function() {
        return expect(absence({a: ''}, 'a', true)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: " "}, "a", true)', function() {
        return expect(absence({a: ' '}, 'a', true)).to.eventually.be.resolved;
      });
    });

    describe('#acceptance', function() {
      var acceptance = Ratify.validators.acceptance;
      [true, 'true', 1, '1'].forEach(function(value) {
        it('returns a resolving promise when passed ({a: ' + toString(value) + '}, "a")', function() {
          return expect(acceptance({a: value}, 'a')).to.eventually.be.resolved;
        });
      });
      [false, 'false', 0, -0, '', ' ', null, undefined, NaN].forEach(function(value) {
        it('returns a rejecting promise when passed ({a: ' + toString(value) + '}, "a")', function() {
          return expect(acceptance({a: value}, 'a')).to.eventually.be.rejected;
        });
      });
    });

    describe('#between', function() {
      var between = Ratify.validators.between;
      it('proxies #numericality with options {greaterThanOrEqualTo: x, lessThanOrEqualTo: y}', function() {
        var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
        between({a: 1}, 'a', [1, 10]);
        sinon.restore(Ratify.validators, 'numericality');
        return expect(numericality.calledWithExactly({a: 1}, 'a', {greaterThanOrEqualTo: 1, lessThanOrEqualTo: 10})).to.be.true;
      });
    });

    describe('#confirmation', function() {
      var confirmation = Ratify.validators.confirmation;

      it('returns a resolving promise when passed ({a: "foo", b: "foo"}, "b", "a")', function() {
        return expect(confirmation({a: "foo", b: "foo"}, 'b', 'a')).to.eventually.be.resolved;
      });


      it('returns a rejecting promise when passed ({a: "foo", b: "bar"}, "b", "a")', function() {
        return expect(confirmation({a: "foo", b: "bar"}, 'b', 'a')).to.eventually.be.rejected;
      });
    });

    describe('#exclusion', function() {
      var exclusion = Ratify.validators.exclusion;

      it('returns a rejecting promise when passed ({a: 1}, "a", {in: [1,2,3]})', function() {
        return expect(exclusion({a: 1}, 'a', {in: [1,2,3]})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: 1}, "a", {in: [4,5,6]})', function() {
        return expect(exclusion({a: 1}, 'a', {in: [4,5,6]})).to.eventually.be.resolved;
      });
    });

    describe('#format', function() {
      var format = Ratify.validators.format;

      it('returns a resolving promise when passed ({a: "foobarbaz"}, "a", {with: /bar/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {with: /bar/})).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "foobarbaz"}, "a", {without: /qux/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {without: /qux/})).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "foobarbaz"}, "a", {with: /bar/, without: /qux/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {with: /bar/, without: /qux/})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foobarbaz"}, "a", {with: /qux/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {with: /qux/})).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: "foobarbaz"}, "a", {without: /bar/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {without: /bar/})).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: "foobarbaz"}, "a", {with: /bar/, without: /bar/})', function() {
        return expect(format({a: 'foobarbaz'}, 'a', {with: /bar/, without: /bar/})).to.eventually.be.rejected;
      });
    });

    describe('#inclusion', function() {
      var inclusion = Ratify.validators.inclusion;

      it('returns a resolving promise when passed ({a: 1}, "a", {in: [1,2,3]})', function() {
        return expect(inclusion({a: 1}, 'a', {in: [1,2,3]})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: 1}, "a", {in: [4,5,6]})', function() {
        return expect(inclusion({a: 1}, 'a', {in: [4,5,6]})).to.eventually.be.rejected;
      });
    });

    describe('#length', function() {
      var length = Ratify.validators.length;

      it('returns a resolving promise when passed ({a: "foo"}, "a", 3)', function() {
        return expect(length({a: 'foo'}, 'a', 3)).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foo"}, "a", 4)', function() {
        return expect(length({a: 'foo'}, 'a', 4)).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", {range: [3,4]})', function() {
        return expect(length({a: 'foo'}, 'a', {range: [3,4]})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foo"}, "a", {range: [1,2]})', function() {
        return expect(length({a: 'foo'}, 'a', {range: [1,2]})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", {minimum: 3})', function() {
        return expect(length({a: 'foo'}, 'a', {minimum: 3})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foo"}, "a", {minimum: 4})', function() {
        return expect(length({a: 'foo'}, 'a', {minimum: 4})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", {maximum: 3})', function() {
        return expect(length({a: 'foo'}, 'a', {maximum: 3})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foo"}, "a", {maximum: 2})', function() {
        return expect(length({a: 'foo'}, 'a', {maximum: 2})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", {is: 3})', function() {
        return expect(length({a: 'foo'}, 'a', {is: 3})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: "foo"}, "a", {is: 2})', function() {
        return expect(length({a: 'foo'}, 'a', {is: 4})).to.eventually.be.rejected;
      });
    });

    describe('#max', function() {
      var max = Ratify.validators.max;
      it('proxies #numericality with options {lessThanOrEqualTo: n}', function() {
        var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
        max({a: 1}, 'a', 42);
        sinon.restore(Ratify.validators, 'numericality');
        return expect(numericality.calledWithExactly({a: 1}, 'a', {lessThanOrEqualTo: 42})).to.be.true;
      });
    });

    describe('#maxLength', function() {
      var maxLength = Ratify.validators.maxLength;
      it('proxies #length with options {maximum: n}', function() {
        var length = sinon.stub(Ratify.validators, 'length').returns('foo');
        maxLength({a: 1}, 'a', 42);
        sinon.restore(Ratify.validators, 'length');
        return expect(length.calledWithExactly({a: 1}, 'a', {maximum: 42})).to.be.true;
      });
    });

    describe('#min', function() {
      var min = Ratify.validators.min;

      it('proxies #numericality with options {greaterThanOrEqualTo: n}', function() {
        var numericality = sinon.stub(Ratify.validators, 'numericality').returns('foo');
        min({a: 1}, 'a', 42);
        sinon.restore(Ratify.validators, 'numericality');
        return expect(numericality.calledWithExactly({a: 1}, 'a', {greaterThanOrEqualTo: 42})).to.be.true;
      });
    });

    describe('#minLength', function() {
      var minLength = Ratify.validators.minLength;
      it('proxies #length with options {minimum: n}', function() {
        var length = sinon.stub(Ratify.validators, 'length').returns('foo');
        minLength({a: 1}, 'a', 42);
        sinon.restore(Ratify.validators, 'length');
        return expect(length.calledWithExactly({a: 1}, 'a', {minimum: 42})).to.be.true;
      });
    });

    describe('#numericality', function() {
      var numericality = Ratify.validators.numericality;

      it('returns a resolving promise when passed ({a: 1}, "a")', function() {
        return expect(numericality({a: 1}, 'a')).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: 123.45}, "a")', function() {
        return expect(numericality({a: 123.45}, 'a')).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "1"}, "a")', function() {
        return expect(numericality({a: "1"}, 'a')).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "123.45"}, "a")', function() {
        return expect(numericality({a: "123.45"}, 'a')).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: 1}, "a", {onlyInteger: true})', function() {
        return expect(numericality({a: 1}, 'a', {onlyInteger: true})).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "1"}, "a", {onlyInteger: true})', function() {
        return expect(numericality({a: "1"}, 'a', {onlyInteger: true})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: 123.45}, "a", {onlyInteger: true})', function() {
        return expect(numericality({a: 123.45}, 'a', {onlyInteger: true})).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: "123.45"}, "a", {onlyInteger: true})', function() {
        return expect(numericality({a: "123.45"}, 'a', {onlyInteger: true})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: 2}, "a", {even: true})', function() {
        return expect(numericality({a: 2}, 'a', {even: true})).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "2"}, "a", {even: true})', function() {
        return expect(numericality({a: "2"}, 'a', {even: true})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: 1}, "a", {even: true})', function() {
        return expect(numericality({a: 1}, 'a', {even: true})).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: "1"}, "a", {even: true})', function() {
        return expect(numericality({a: "1"}, 'a', {even: true})).to.eventually.be.rejected;
      });

      it('returns a resolving promise when passed ({a: 1}, "a", {odd: true})', function() {
        return expect(numericality({a: 1}, 'a', {odd: true})).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "1"}, "a", {odd: true})', function() {
        return expect(numericality({a: "1"}, 'a', {odd: true})).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({a: 2}, "a", {odd: true})', function() {
        return expect(numericality({a: 2}, 'a', {odd: true})).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: "2"}, "a", {odd: true})', function() {
        return expect(numericality({a: "2"}, 'a', {odd: true})).to.eventually.be.rejected;
      });
    });

    describe('#presence', function() {
      var presence = Ratify.validators.presence;

      it('returns a resolving promise when passed ({a: "foo"}, "a", true)', function() {
        return expect(presence({a: 'foo'}, 'a', true)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({a: "foo"}, "a", false)', function() {
        return expect(presence({a: 'foo'}, 'a', false)).to.eventually.be.resolved;
      });

      it('returns a resolving promise when passed ({}, "a", false)', function() {
        return expect(presence({}, 'a', false)).to.eventually.be.resolved;
      });

      it('returns a rejecting promise when passed ({}, "a", true)', function() {
        return expect(presence({}, 'a', true)).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: null}, "a", true)', function() {
        return expect(presence({a: null}, 'a', true)).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: undefined}, "a", true)', function() {
        return expect(presence({a: undefined}, 'a', true)).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: ""}, "a", true)', function() {
        return expect(presence({a: ''}, 'a', true)).to.eventually.be.rejected;
      });

      it('returns a rejecting promise when passed ({a: " "}, "a", true)', function() {
        return expect(presence({a: ' '}, 'a', true)).to.eventually.be.rejected;
      });
    });
  });
});
