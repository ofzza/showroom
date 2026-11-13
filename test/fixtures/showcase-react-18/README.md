# React 18 host

A showcase rendered with the host's own React 18:

```tsx showcase=react
import { useState, version } from 'react';

export default function Version() {
  const [label] = useState(`React ${version}`);
  return <p>{label}</p>;
}
```
