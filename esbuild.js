const path = require('path')
const rmrf = require('rimraf')
const fs = require('fs')
const esbuild = require('esbuild')

require('zotero-plugin/copy-assets')
require('zotero-plugin/rdf')
require('zotero-plugin/version')

async function build() {
  rmrf.sync('gen')
  await esbuild.build({
    bundle: true,
    format: 'iife',
    target: ['firefox60'],
    entryPoints: [ 'content/zotodo.ts' ],
    outdir: 'build/content',
  })
}

build().catch(err => {
  console.log(err)
  process.exit(1)
})
