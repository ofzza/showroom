# react showcase errors host

No default export:

```tsx showcase=react
export function Named() {
  return <p>named</p>;
}
```

A type error:

```tsx showcase=react
export default function Typed() {
  const count: number = 'one';
  return <p>{count}</p>;
}
```

No default export in a [linked file](./demos/NoDefault.tsx 'showcase=react').
