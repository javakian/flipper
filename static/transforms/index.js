/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

const generate = require('@babel/generator').default;
const babylon = require('@babel/parser');
const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

function transform({filename, options, src}) {
  const presets = [require('../node_modules/@babel/preset-react')];
  const isPlugin =
    options.projectRoot && !__dirname.startsWith(options.projectRoot);
  const isTypeScript = filename.endsWith('.tsx');

  let ast = babylon.parse(src, {
    filename,
    plugins: isTypeScript
      ? [
          'jsx',
          'typescript',
          'classProperties',
          'optionalChaining',
          'nullishCoalescingOperator',
        ]
      : [
          'jsx',
          ['flow', {all: true}],
          'classProperties',
          'objectRestSpread',
          'optionalChaining',
          'nullishCoalescingOperator',
        ],
    sourceType: 'module',
  });

  // run babel
  const plugins = [];

  if (!isTypeScript) {
    plugins.push(
      require('../node_modules/@babel/plugin-transform-modules-commonjs'),
      require('../node_modules/@babel/plugin-proposal-object-rest-spread'),
      require('../node_modules/@babel/plugin-proposal-class-properties'),
      require('../node_modules/@babel/plugin-transform-flow-strip-types'),
      require('../node_modules/@babel/plugin-proposal-optional-chaining'),
      require('../node_modules/@babel/plugin-proposal-nullish-coalescing-operator'),
      require('./dynamic-requires.js'),
    );
  } else {
    plugins.push(
      require('../node_modules/@babel/plugin-transform-typescript'),
      require('../node_modules/@babel/plugin-proposal-class-properties'),
      require('../node_modules/@babel/plugin-transform-modules-commonjs'),
      require('../node_modules/@babel/plugin-proposal-optional-chaining'),
      require('../node_modules/@babel/plugin-proposal-nullish-coalescing-operator'),
    );
  }

  if (
    fs.existsSync(
      path.resolve(path.dirname(path.dirname(__dirname)), 'src', 'fb'),
    )
  ) {
    plugins.push(require('./fb-stubs.js'));
  }

  if (process.env.BUILD_HEADLESS) {
    plugins.push(require('./electron-stubs.js'));
  }
  if (!options.isTestRunner) {
    // Replacing require statements with electronRequire to prevent metro from
    // resolving them. electronRequire are resolved during runtime by electron.
    // As the tests are not bundled by metro and run in @jest-runner/electron,
    // electron imports are working out of the box.
    plugins.push(require('./electron-requires.js'));
  }
  if (isPlugin) {
    plugins.push(require('./flipper-requires.js'));
  } else {
    plugins.push(require('./import-react.js'));
  }
  ast = babel.transformFromAst(ast, src, {
    ast: true,
    babelrc: !filename.includes('node_modules'),
    code: false,
    comments: false,
    compact: false,
    root: options.projectRoot,
    filename,
    plugins,
    presets,
    sourceMaps: true,
  }).ast;

  const result = generate(
    ast,
    {
      filename,
      sourceFileName: filename,
      sourceMaps: true,
    },
    src,
  );
  return {
    ast,
    code: result.code,
    filename,
    map: result.map,
  };
}

module.exports = {
  transform,
  // Disable caching of babel transforms all together. We haven't found a good
  // way to cache our transforms, as they rely on side effects like env vars or
  // the existence of folders in the file system.
  getCacheKey: () => Math.random().toString(36),
  process(src, filename, config, options) {
    return transform({
      src,
      filename,
      config,
      options: {...options, isTestRunner: true},
    });
  },
};
