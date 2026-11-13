# Classic JSX

The tsconfig asks for the classic runtime, which type checking keeps; the build still uses the automatic one:

```tsx showcase=react
import React from 'react';

export default function Classic() {
  return <p>classic</p>;
}
```
