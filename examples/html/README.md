# `numerals`

> A made-up CSS library, and the `html` showcase adapter's example: this is how a host repository could document its HTML and CSS with `showroom`. See [`README.md` › Showcases](../../README.md#showcases) for how showcases are written.

`numerals` makes numbers people enjoy reading: aligned in tables, grouped into thousands, playful, or glowing like an old clock radio.

## A 7-segment clock

A page of its own, linked as a showcase. It needs nothing else: its styles and script are inline, as an `html` showcase follows no files.

[A 7-segment clock](./clock.html 'showcase')

## The stylesheet

`numerals` is a single stylesheet. Here it is as a showcase resource, which every `html` showcase in this folder can link as `./numerals.css`. The `html` showcase adapter copies only resources next to a showcase's page, never real files, so a library meant for `html` showcases lives in its documentation as a resource.

```css showcase file=numerals.css
.tabular {
  font-variant-numeric: tabular-nums;
}

.grouped > span + span {
  margin-left: 0.2em;
}

.comic {
  font-family: 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive;
  font-size: 2rem;
  font-weight: bold;
}
.comic > span {
  display: inline-block;
}
.comic > span:nth-child(4n + 1) {
  color: light-dark(#d13438, #ff6b6b);
  transform: rotate(-6deg);
}
.comic > span:nth-child(4n + 2) {
  color: light-dark(#ca5010, #ffaa44);
  transform: translateY(-0.15em);
}
.comic > span:nth-child(4n + 3) {
  color: light-dark(#107c10, #6ccb5f);
  transform: rotate(5deg);
}
.comic > span:nth-child(4n + 4) {
  color: light-dark(#0f6cbd, #479ef5);
  transform: translateY(0.1em);
}

.big {
  font-size: 3rem;
  font-weight: 700;
  color: light-dark(#0f6cbd, #479ef5);
}

.lcd {
  display: inline-block;
  padding: 0.25em 0.5em;
  border-radius: 0.25em;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  letter-spacing: 0.1em;
  color: #6ccb5f;
  background: #11261a;
  text-shadow: 0 0 0.3em #6ccb5f;
}
```

## Tabular figures

Proportional figures (the default in most fonts) give each digit its own width, so columns of prices don't line up. `.tabular` gives every digit the same width.

```html showcase
<link rel="stylesheet" href="./numerals.css" />
<table>
  <tr>
    <th>Proportional</th>
    <th class="tabular">.tabular</th>
  </tr>
  <tr>
    <td align="right">1,111.11</td>
    <td align="right" class="tabular">1,111.11</td>
  </tr>
  <tr>
    <td align="right">888.88</td>
    <td align="right" class="tabular">888.88</td>
  </tr>
  <tr>
    <td align="right">17,010.70</td>
    <td align="right" class="tabular">17,010.70</td>
  </tr>
</table>
```

## Grouped digits

`.grouped` spaces groups of digits apart, without a separator character that differs between languages (`,` or `.`), and that copying the number would carry along.

```html showcase
<link rel="stylesheet" href="./numerals.css" />
<p>Plain: 299792458 m/s</p>
<p>
  Grouped: <span class="grouped"><span>299</span><span>792</span><span>458</span></span> m/s
</p>
```

## Comic digits

`.comic` makes every digit its own colour, bouncing a little. Each digit is a `span`; the colours follow the showroom's light and dark theme, through `light-dark()`.

```html showcase
<link rel="stylesheet" href="./numerals.css" />
<p class="comic"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></p>
```

## Large figures and displays

`.big` for the one number a page is about, and `.lcd` for a calculator's display. Switch the showroom's theme to see `.big` follow it.

```html showcase
<link rel="stylesheet" href="./numerals.css" />
<p><span class="big tabular">42</span> answers</p>
<p><span class="lcd tabular">3.1415926</span></p>
```
