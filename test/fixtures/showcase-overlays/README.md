# Showcase overlays

The `overlays` key, where it can be and where it can't.

```html showcase overlays
<p>A code block showcase with overlays</p>
```

[The page as a block](./page.html 'showcase block overlays')

An inline showcase with a demo view: [the page](./page.html 'showcase view=demo overlays').

An inline showcase with no views: [the page](./page.html 'showcase overlays').

```html showcase view=source,console overlays
<p>No demo view</p>
```

```ts showcase=ts overlays
console.log('The ts showcase adapter shows source and console by default');
```

```css showcase file=plain.css overlays
/* A virtual file with no showcase adapter */
```
