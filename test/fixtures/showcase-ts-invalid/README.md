# Invalid ts showcases host

```tsx showcase=ts
export const value = <b>x</b>;
```

```html showcase=ts
<p>Not a module</p>
```

A [jsx file](./demos/app.jsx 'showcase=ts') and a [CommonJS one](./demos/common.cjs 'showcase=ts').

```ts showcase=ts({ typeCheck: 'yes', size: 2 })
console.log('options');
```

Valid ones, in every language:

```typescript showcase=ts({ typeCheck: false })
console.log('typescript');
```

```javascript showcase=ts
console.log('javascript');
```

```mts showcase=ts
console.log('mts');
```

```mjs showcase=ts
console.log('mjs');
```
