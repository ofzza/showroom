# Showcase frames host

A page:

```html showcase
<!doctype html>
<html><head><title>Page</title></head><body><p>A page</p></body></html>
```

A fragment:

```html showcase include=fragment.js
<p class="fragment">A fragment</p><script src="./fragment.js"></script>
```

A [linked page](./demos/page.html 'showcase include=./demos/page.css'), and the [notes](docs/my%20notes%20%231.md).

A resource, next to every html showcase frame of this folder:

```js showcase file=fragment.js
document.querySelector('.fragment').textContent += ', with a resource';
```
