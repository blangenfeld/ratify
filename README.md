# Ratify

[![Test Coverage](https://codeclimate.com/github/blangenfeld/ratify/badges/coverage.svg)](https://codeclimate.com/github/blangenfeld/ratify/coverage)
[![Issue Count](https://codeclimate.com/github/blangenfeld/ratify/badges/issue_count.svg)](https://codeclimate.com/github/blangenfeld/ratify)
[![Code Climate](https://codeclimate.com/github/blangenfeld/ratify/badges/gpa.svg)](https://codeclimate.com/github/blangenfeld/ratify)


Promise-based attribute and model validation library.

Does:
- validate object attributes
- let you define custom validations
- support asynchronous validations

Doesn't:
- offer view binding
- handle error message formatting
- care what frameworks or other libraries you use

See my [blog post](https://knotfield.com/blog) (actual link coming soon) about this thing for a more detailed writeup -- motivation, use cases, design considerations, et cetera.

## Examples

```javascript
// Describe the validation function you want.
var validateModel = Ratify.getModelValidator({
  username: {presence: true},
  password: {presence: true, length: {minimum: 5}},
  passwordConfirmation: {confirmation: 'password'},
  email: {format: /^\w+@\w+\.\w+$/}
});

// Bring your own model attributes.
var attrs = {username: 'brian', password: 'wat?', passwordConfirmation: '', email: 'not-an-email!'};

// Validate all attributes.
validateModel(attrs)
  .then(function() {
    // All attributes are valid
    console.log('all OK!');
  })
  .catch(Ratify.ValidationError, function(e) {
    // Validation(s) failed. See which attributes had errors by inspecting e.errors.
    // In this case, e.errors is {password: {length: true}, passwordConfirmation: {confirmation: true}, email: {format: true}
    console.log(e.errors);
  });

// Validate individual attributes
validateModel(attrs, 'email')
  .then(function() {
    // Attribute is valid
    console.log('email OK');
  })
  .catch(Ratify.ValidationError, function(e) {
    // Attribute is invalid
    // e.errors is {email: {format: true}}
    console.log(e.errors);
  });
```

## Dependencies

Just two, at this time:

- [Bluebird](http://bluebirdjs.com/docs/getting-started.html) for promise support
- [Underscore](http://underscorejs.org/) to help keep our code simple and concise


## Installation

I'll get this published via npm if there's interest.
