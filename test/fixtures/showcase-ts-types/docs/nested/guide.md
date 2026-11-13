# A nearer tsconfig

Its tsconfig turns noImplicitAny off:

```ts showcase=ts
const identity = (value) => value;
console.log(identity(1));
```
