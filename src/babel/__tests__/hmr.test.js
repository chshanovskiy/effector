import {readFile} from 'fs/promises'
import babelPlugin from '../babel-plugin'
import {join} from 'path'
import {transformAsync} from '@babel/core'

async function transformCase(caseId) {
  const code = await readFile(
    join(__dirname, `./fixtures/hmr/${caseId}.js`),
    'utf-8',
  )
  return transformAsync(code, {
    plugins: [[babelPlugin, {addNames: false, addLoc: false, hmr: true}]],
  }).then(({code}) => code)
}

describe('hmr babel option', () => {
  test('effector code at root', async () => {
    expect(await transformCase(1)).toMatchInlineSnapshot()
  })

  test('effector code in incorrect uncalled fabric', async () => {
    expect(await transformCase(2)).toMatchInlineSnapshot()
  })

  test('effector code in incorrect called fabric', async () => {
    expect(await transformCase(3)).toMatchInlineSnapshot()
  })

  test('effector code in correct uncalled fabric', async () => {
    expect(await transformCase(4)).toMatchInlineSnapshot()
  })

  test('effector code at corrent called fabric', async () => {
    expect(await transformCase(5)).toMatchInlineSnapshot()
  })

  test('effector code at corrent called fabric (callback in invoke)', async () => {
    expect(await transformCase(5.1)).toMatchInlineSnapshot()
  })

  test('effector code at root & incorrect uncalled fabric in same file', async () => {
    expect(await transformCase(6)).toMatchInlineSnapshot()
  })

  test('effector code at root & incorrect called fabric in same file', async () => {
    expect(await transformCase(7)).toMatchInlineSnapshot()
  })

  test('effector code at root & correct uncalled fabric in same file', async () => {
    expect(await transformCase(8)).toMatchInlineSnapshot()
  })

  test('effector code at root & correct called fabric in same file', async () => {
    expect(await transformCase(9)).toMatchInlineSnapshot()
  })

  test('effector code at root & correct called fabric in same file (callback in invoke)', async () => {
    expect(await transformCase(9.1)).toMatchInlineSnapshot()
  })
})
