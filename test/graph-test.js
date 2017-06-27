const { Graph, RID, inKey, outKey, CLASS, REF, UPSERT } = require('..')
const { expect } = require('chai')
const util = require('util')

describe('graph', function () {
  it('should accept vertices', function () {
    const g = new Graph()
    const t = g.addVertex({a: 1})
    expect(t.nodes.length).to.equal(1)
  })
  it('should link vertices with edges', function () {
    const g = new Graph()
    const v1 = g.addVertex({a: 1})
    const v2 = g.addVertex({b: 2})
    const e = g.addEdge(v1, v2, 'likes', {c: 3})
    expect(v1.first()[outKey('likes')][0]).to.equal(e.first()[RID])
    expect(v2.first()[inKey('likes')][0]).to.equal(e.first()[RID])
    expect(g.v().has({a: 1}).out('likes').first().b).to.equal(2)
    expect(g.v().has({b: 2}).in('likes').first().a).to.equal(1)
    expect(g.v().has({a: 1}).both('likes').first().b).to.equal(2)
    expect(g.v().has({b: 2}).both('likes').first().a).to.equal(1)
  })
  it('should be able to remove edges', function () {
    const g = new Graph()
    const v1 = g.addVertex({a: 1})
    const v2 = g.addVertex({b: 2})
    const e = g.addEdge(v1, v2, 'likes', {c: 3})
    expect(g.vertices.length).to.equal(2)
    g.e(e.first()[RID]).remove()
    expect(g.vertices.length).to.equal(2)
    expect(g.edges.length).to.equal(0)
    expect(v1.first()[outKey('likes')].length).to.equal(0)
    expect(v2.first()[inKey('likes')].length).to.equal(0)
  })
  it('should be able to remove vertices', function () {
    const g = new Graph()
    const v1 = g.addVertex({a: 1})
    const v2 = g.addVertex({b: 2})
    const e = g.addEdge(v1, v2, 'likes', {c: 3})
    expect(g.vertices.length).to.equal(2)
    v1.remove()
    expect(g.edges.length).to.equal(0)
    expect(g.vertices.length).to.equal(1)
    v2.remove()
    expect(g.vertices.length).to.equal(0)
    expect(v1.first()[outKey('likes')].length).to.equal(0)
    expect(v2.first()[inKey('likes')].length).to.equal(0)
  })
  it('should be able to manifest the entire graph as an object', function () {
    const g = new Graph()
    const v1 = g.addVertex({a: 1})
    const v2 = g.addVertex({b: 2})
    g.addEdge(v1, v2, 'likes', {c: 3})
    const m = g.manifest()
    const a = m.vertices.find(v => v.a === 1)
    console.log(util.inspect(m, {showHidden: false, depth: null}))
    expect(a).to.exist
    expect(a.a).to.equal(1)
    expect(a.out_likes).to.exist
    expect(a.out_likes.length).to.equal(1)
    expect(a.out_likes[0].c).to.equal(3)
    expect(a.out_likes[0].in).to.exist
    expect(a.out_likes[0].in.b).to.equal(2)
  })

  const tomActedInGump = [
    { [REF]: 'tom', name: 'Tom Hanks' },
    { [REF]: 'gump', name: 'Forrest Gump' },
    { out: 'tom', label: 'actedIn', in: 'gump' }
  ]
  const tomActedInCloud = [
    { [REF]: 'tom', name: 'Tom Hanks' },
    { [REF]: 'cloud', name: 'Cloud Atlas' },
    { out: 'tom', label: 'actedIn', in: 'cloud' }
  ]
  const hugoActedInCloud = [
    { [REF]: 'hugo', name: 'Hugo Weaving' },
    { [REF]: 'cloud', name: 'Cloud Atlas' },
    { out: 'hugo', label: 'actedIn', in: 'cloud' }
  ]
  const hugoActedInMatrix = [
    { [REF]: 'hugo', name: 'Hugo Weaving' },
    { [REF]: 'matrix', name: 'The Matrix' },
    { out: 'hugo', label: 'actedIn', in: 'matrix' }
  ]

  it('should be able to learn knowledge', function () {
    const g = new Graph()
    const res1 = g.learn(tomActedInGump)
    expect(g.vertices.length).to.equal(2)
    expect(g.edges.length).to.equal(1)
    expect(res1.tom.name).to.equal('Tom Hanks')
    expect(g.edges[0].label).to.equal('actedIn')

    // Relearning the same info should not result in additional records
    const res2 = g.learn(tomActedInGump)
    expect(g.vertices.length).to.equal(2)
    expect(g.edges.length).to.equal(1)
    expect(res2.tom).to.equal(res1.tom)

    g.learn(tomActedInCloud)
    g.learn(hugoActedInCloud)
    g.learn(hugoActedInMatrix)
  })
})
