import * as migration_20260903_230650_initial from './20260903_230650_initial';

export const migrations = [
  {
    up: migration_20260903_230650_initial.up,
    down: migration_20260903_230650_initial.down,
    name: '20260903_230650_initial'
  },
];
