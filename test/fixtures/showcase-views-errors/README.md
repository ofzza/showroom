# Showcase view errors

Each showcase below breaks one rule of the views.

```html showcase view=Demo
<p>An unknown view: views are case-sensitive</p>
```

```html showcase view=none,demo
<p>none with another view</p>
```

```html showcase view=none include=extra.css
<p>none with included files, which nothing would show</p>
```

```html showcase include=extra.css
<p>none from showroom.json, with included files</p>
```

An inline link takes no views yet: [the page](./page.html 'showcase view=source').

```css showcase file=built.css view=demo
/* A virtual file with no showcase adapter is never built */
```
