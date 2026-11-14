# A solution-style tsconfig

Its tsconfig names no files (`files: []`, with `references`, as the Angular CLI generates), so the entry point is the only root:

```ts showcase=angular
import { Component } from '@angular/core';

@Component({ template: '<p class="solution">solution</p>' })
export default class Solution {}
```
