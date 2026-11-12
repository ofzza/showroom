# Showcase build errors

A showcase failing with errors in its code block, without a position, outside the host repository, and in a real file:

```js showcase=failing
const a = 1;
const = 2;
```

A showcase whose showcase adapter throws:

```js showcase=throwing
console.log('throwing');
```

A showcase whose showcase adapter returns an invalid result:

```js showcase=invalid
console.log('invalid');
```

A showcase that builds:

```html showcase
<p>Builds fine</p>
```
