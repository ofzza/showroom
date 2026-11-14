# react showcases host

A showcase with state, a host component, a virtual component and CSS:

```tsx showcase=react
import { useState } from 'react';
import { Counter } from './Counter';
import { Label } from './label';
import './counter.css';

export default function Demo() {
  const [shown] = useState('from state');
  return (
    <>
      <Label text={shown} />
      <Counter start={41} />
    </>
  );
}
```

```tsx showcase file=label.tsx
export const Label = ({ text }: { text: string }) => <span className="label">{text}</span>;
```

```css showcase file=counter.css
.label { color: teal; }
```

A component wrapped in `memo()`, an object rather than a function:

```tsx showcase=react
import { memo } from 'react';

export default memo(function Memoized() {
  return <p>memoized</p>;
});
```

A [linked JSX one](./demos/Plain.jsx 'showcase=react'), with named exports too.
