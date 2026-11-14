import { Component, input } from '@angular/core';
import * as i0 from "@angular/core";
export class GreetingComponent {
    name = input('world', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "name" }] : /* istanbul ignore next */ []));
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.2.6", ngImport: i0, type: GreetingComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.1.0", version: "22.2.6", type: GreetingComponent, isStandalone: true, selector: "host-greeting", inputs: { name: { classPropertyName: "name", publicName: "name", isSignal: true, isRequired: false, transformFunction: null } }, ngImport: i0, template: `<p class="greeting">Hello, {{ name() }}!</p>`, isInline: true });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "22.2.6", ngImport: i0, type: GreetingComponent, decorators: [{
            type: Component,
            args: [{
                    selector: 'host-greeting',
                    template: `<p class="greeting">Hello, {{ name() }}!</p>`,
                }]
        }], propDecorators: { name: [{ type: i0.Input, args: [{ isSignal: true, alias: "name", required: false }] }] } });
