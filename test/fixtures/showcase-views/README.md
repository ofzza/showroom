# Showcase views

The views of each showcase: the marker's, the configuration's default for its showcase adapter, or the showcase adapter's own.

```html showcase
<p>html: the configuration's source and demo</p>
```

```html showcase view=console
<p>html: the marker's console</p>
```

```ts showcase=ts
console.log('ts: its own source and console');
```

```js showcase=plain
// plain: its own source
```

```js showcase=bare
// bare: the configuration's markdown
```

```js showcase=bare view=demo,console
// bare: the marker's demo and console
```

An inline link is always a demo: [the page](./page.html 'showcase').

[The page, shown as nothing](./page.html 'showcase block view=none')

```css showcase file=notes.css
/* A virtual file with no showcase adapter: source by default */
```

```css showcase file=shown.css view=markdown
/* Its Markdown */
```

```css showcase file=hidden.css view=none
/* Nothing */
```
