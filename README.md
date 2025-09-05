# TypeDoc Copy Doc Plugin

This plugin will allow you to reuse documentation between class and function declarations. It will automatically match parameters
and type parameters and copy and paste their descriptions over. Also it will fill in a summary from the **first** `@copyDoc` tag
source it finds if none is specified on the target reflection of the tag.

This plugin was born out of this [discussion](https://github.com/TypeStrong/typedoc/discussions/3008#discussioncomment-14298716)
where I wanted to do partial inheritance of documentation between classes that have the same `@typeParam`.

Credit to [Gerrit0](https://github.com/Gerrit0) who suggested the name and the [typedoc](https://github.com/TypeStrong/typedoc)
contributors who developed the `InheritDocPlugin` that this plugin is heavily based on.

## Installation

```bash
npm i --save-dev typedoc-plugin-copy-doc
```
and add to TypeDoc config

```json
"plugin": ["typedoc-plugin-copy-doc"]
```

## Examples

### Simple example with classes

Before (duplicate documentation):

```ts
/**
 * This is the Foo class
 *
 * @typeParam A foo variable type
 */
export class Foo<A> {
  constructor(public foo: A) {}
}

/*
 * This is the Bar class
 *
 * @typeParam A foo variable type
 */
export class Bar<A> extends Foo<A> {}
```

After:

```ts
/**
 * This is the Foo class
 *
 * @typeParam A foo variable type
 */
export class Foo<A> {
  constructor(public foo: A) {}
}

/*
 * This is the Bar class
 *
 * @copyDoc Foo
 */
export class Bar<A> extends Foo<A> {}
```

### Compilcated example with classes

Before:

```ts
/**
 * Summary 1
 *
 * @typeParam A foo type generic 1
 * @typeParam B foo type generic 2
 */
export class Foo<A, B> {
  constructor(public foo: A & B) {}
}

/*
 * Summary 2
 *
 * @typeParam C bar type generic 1
 * @typeParam D bar type generic 2
 */
export class Bar<C, D> {
  constructor(public bar: C & D) {}
}

/*
 * Summary 1
 *
 * @typeParam A foo type generic 1
 * @typeParam C bar type generic 1
 * @typeParam E baz type generic 1
 */
export class Baz<A, C, E> {
  constructor(public baz: A & C & E) {}
}
```

After:

```ts
/**
 * Summary 1
 *
 * @typeParam A foo type generic 1
 * @typeParam B foo type generic 2
 */
export class Foo<A, B> {
  constructor(public foo: A & B) {}
}

/*
 * Summary 2
 *
 * @typeParam C bar type generic 1
 * @typeParam D bar type generic 2
 */
export class Bar<C, D> {
  constructor(public bar: C & D) {}
}

/*
 * @copyDoc Foo
 * @copyDoc Bar
 * @typeParam E baz type generic 1
 */
export class Baz<A, C, E> {
  constructor(public baz: A & C & E) {}
}
```

Here we have:
* picked a subset of type parameters from `Foo` and `Bar` to get documentation for
* copied and pasted the first class's summary (`Foo`) into the summary for `Baz`
* extended the type parameters for `Baz` by including `E`

### Compilcated example with functions

You can do the same for parameters in functions, the function bodies are not important here:

```ts
/**
 * Summary 1
 *
 * @typeParam T fun1 generic 1
 * @typeParam U fun1 generic 2
 * @param x fun1 number
 * @param y fun1 string
 */
export const fun1 = <T, U>(x: number, y: string) => {
  return x * y.length;
};

/**
 * Summary 2
 *
 * @typeParam V fun2 generic 1
 * @typeParam W fun2 generic 2
 * @param z fun2 number
 * @param a fun2 string
 * @param b fun2 boolean
 */
export const fun2 = <V, W>(z: number, a: string, b: boolean) => {
  return b ? z * a.length : 0;
};

/**
 * Merges fun1 and fun2
 *
 * @typeParam T fun1 generic 1
 * @typeParam W fun2 generic 2
 * @param x fun1 number
 * @param y fun1 string
 * @param z fun2 number
 * @param a fun2 string
 * @param t funmerge number
 */
export const funmerge = <T, W>(
  x: number,
  y: string,
  z: number,
  a: string
  t: number
) => {
  const res1 = fun1<T, null>(x, y);
  const res2 = fun2<null, W>(z, a, true);
  return res1 * res2 * t;
}; 
```

After:
```ts
/**
 * Summary 1
 *
 * @typeParam T fun1 generic 1
 * @typeParam U fun1 generic 2
 * @param x fun1 number
 * @param y fun1 string
 */
export const fun1 = <T, U>(x: number, y: string) => {
  return x * y.length;
};

/**
 * Summary 2
 *
 * @typeParam V fun2 generic 1
 * @typeParam W fun2 generic 2
 * @param z fun2 number
 * @param a fun2 string
 * @param b fun2 boolean
 */
export const fun2 = <V, W>(z: number, a: string, b: boolean) => {
  return b ? z * a.length : 0;
};

/**
 * Merges fun1 and fun2
 *
 * @copyDoc fun1
 * @copyDoc fun2
 * @param t funmerge number
 */
export const funmerge = <T, W>(
  x: number,
  y: string,
  z: number,
  a: string
  t: number
) => {
  const res1 = fun1<T, null>(x, y);
  const res2 = fun2<null, W>(z, a, true);
  return res1 * res2 * t;
}; 
```

Note, in all these examples, the parameter or type parameter name must match exactly between the source of the
documentation and the target, otherwise this will not work.
