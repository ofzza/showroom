# ts showcases without a tsconfig

TypeScript's own defaults apply (strict, on TypeScript 6):

```ts showcase=ts
const identity = (value) => value;
console.log(identity(1));
```
