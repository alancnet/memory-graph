const _ = require('lodash')
const uuid = require('uuid')
const RID = '@rid'
const TYPE = '@type'
const VERTEX = 'VERTEX'
const EDGE = 'EDGE'
const CLASS = '@class'
const REF = '@ref'
const UPSERT = '@upsert'

const isTraversal = (t) => t && t instanceof Traversal
function assertIsTraversal (t) {
  if (!isTraversal(t)) throw new Error('Expected Traversal')
}
const isVertex = (v) => v && v[TYPE] === VERTEX
function assertIsVertex (v) {
  if (!isVertex(v)) throw new Error('Expected Vertex')
}
const isEdge = (e) => e && e[TYPE] === EDGE
function assertIsEdge (e) {
  if (!isEdge(e)) throw new Error('Expected Edge')
}
const isLabel = (s) => s && typeof s === 'string'
function assertIsLabel (s) {
  if (!isLabel(s)) throw new Error('Expected non-empty string as Label')
}
const isNode = (n) => n && n[TYPE] === VERTEX || n[TYPE] === EDGE
function assertIsNode (s) {
  if (!isNode(s)) throw new Error('Expected Vertex or Edge')
}
const flatten = (array) => {
  const flatter = array.reduce((a, b) => a.concat(b), [])
  if (flatter.length > array.length) return flatten(flatter)
  else return flatter
}
const filterArray = (array, predicate) => {
  var count = 0
  for (var i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      array.splice(i--, 1)
      count++
    }
  }
  return count
}
const merge = (parent, traversals) => new Traversal(parent.graph, parent,
  flatten(traversals)
  .map(x => isTraversal(x) ? x.nodes : x(parent).nodes)
  .reduce((a, b) => a.concat(b), [])
)
const singleVertex = (v) => {
  if (isTraversal(v)) return singleVertex(v.nodes)
  if (isVertex(v)) return v
  if (Array.isArray(v)) {
    if (v.length !== 1) throw new Error(`Expected 1 Vertex. Got ${v.length}.`)
    return singleVertex(v[0])
  }
  throw new Error('Expected Vertex, Traversal, or Array')
}
const singleEdge = (v) => {
  if (isTraversal(v)) return singleEdge(v.nodes)
  if (isEdge(v)) return v
  if (Array.isArray(v)) {
    if (v.length !== 1) throw new Error(`Expected 1 Edge. Got ${v.length}.`)
    return singleEdge(v[0])
  }
  throw new Error('Expected Edge, Traversal, or Array')
}

const outKey = (label) => `out_${label}`
const inKey = (label) => `in_${label}`
const identity = x => x
const truthy = x => !!x

class Graph {
  constructor (data) {
    this.vertices = data && data.vertices || []
    this.edges = data && data.edges || []
    this.nodes = {}
    this.vertices.forEach(v => this.register(v))
    this.edges.forEach(e => this.register(e))
  }
  clone () {
    return new Graph({
      vertices: _.cloneDeep(this.vertices),
      edges: _.cloneDeep(this.edges)
    })
  }
  register (node) {
    assertIsNode(node)
    if (this.nodes.hasOwnProperty(node[RID])) {
      throw new Error(`Duplicate @rid: ${node[RID]}`)
    }
    this.nodes[node[RID]] = node
  }
  addVertex (obj) {
    const vertex = Object.assign({[RID]: uuid(), [TYPE]: VERTEX}, obj)
    this.register(vertex)
    this.vertices.push(vertex)
    return new Traversal(this, this.v, [vertex])
  }
  addEdge (outV, inV, label, obj) {
    outV = singleVertex(outV)
    inV = singleVertex(inV)
    assertIsLabel(label)
    const edge = Object.assign(
      {[RID]: uuid(), [TYPE]: EDGE},
      obj,
      {
        out: outV[RID],
        in: inV[RID],
        label
      }
    )
    this.register(edge)
    const ok = outKey(label)
    const ik = inKey(label)
    if (!outV[ok]) outV[ok] = []
    if (!inV[ik]) inV[ik] = []
    outV[ok].push(edge[RID])
    inV[ik].push(edge[RID])
    this.edges.push(edge)
    return new Traversal(this, this.v, [edge])
  }
  remove (node) {
    if (node[TYPE] === VERTEX) {
      flatten(
        Object.keys(node)
          .filter(k => k.startsWith('out_') || k.startsWith('in_'))
          .map(k => node[k])
      )
        .map(rid => this.nodes[rid])
        .forEach(e => this.remove(e))

      const removed = filterArray(this.vertices, v => v === node)
      if (removed !== 1) throw new Error(`Expected 1 item to be deleted. Got ${removed}.`)
      delete this.nodes[node[RID]]
    } else if (node[TYPE] === EDGE) {
      const outV = this.nodes[node.out]
      const inV = this.nodes[node.in]
      const ok = outKey(node.label)
      const ik = inKey(node.label)
      filterArray(outV[ok], k => k === node[RID])
      filterArray(inV[ik], k => k === node[RID])
      filterArray(this.edges, e => e === node)
      delete this.nodes[node[RID]]
    }
  }
  v (rid) {
    if (rid && rid[RID]) rid = rid[RID]
    if (rid) {
      return new Traversal(this, null, [this.nodes[rid]]
        .filter(identity).filter(x => x[TYPE] === VERTEX))
    } else {
      return new Traversal(this, null, this.vertices)
    }
  }
  e (rid) {
    if (rid && rid[RID]) rid = rid[RID]
    if (rid) {
      return new Traversal(this, null, [this.nodes[rid]]
        .filter(identity).filter(x => x[TYPE] === EDGE))
    } else {
      return new Traversal(this, null, this.edges)
    }
  }
  manifest (VertexClass, EdgeClass) {
    if (!VertexClass) VertexClass = Object
    if (!EdgeClass) EdgeClass = Object
    const nodes = _.cloneDeep(this.nodes)
    this.vertices.map(v => v[RID])
      .forEach(rid => (
        nodes[rid] = Object.assign(new VertexClass(nodes[rid]), nodes[rid])
      ))
    this.edges.map(v => v[RID])
      .forEach(rid => (
        nodes[rid] = Object.assign(new EdgeClass(nodes[rid]), nodes[rid])
      ))
    const vertices = this.vertices.map(v => nodes[v[RID]])
    const edges = this.edges.map(e => nodes[e[RID]])
    vertices.forEach(v => Object.keys(v).forEach(key => {
      if (key.startsWith('out_') || key.startsWith('in_')) {
        const arr = v[key]
        arr.forEach((x, i) => {
          arr[i] = nodes[x]
        })
      }
    }))
    edges.forEach(e => {
      e.out = nodes[e.out]
      e.in = nodes[e.in]
    })
    return {vertices, edges}
  }
  export () {
    return {
      vertices: _.cloneDeep(this.vertices),
      edges: _.cloneDeep(this.edges)
    }
  }
  learn (knowledge, upsert) {
    knowledge = _.cloneDeep(knowledge)
    const refs = {}
    const addHas = (q, fields, obj, i) =>
      !fields ? q
      : typeof fields === 'string' && fields.includes(',')
      ? addHas(q, fields.split(','), obj, i)
      : i === undefined ? addHas(q, fields, obj, 0)
      : i === fields.length ? q
      : addHas(q.has({[fields[i]]: obj[fields[i]]}), fields, obj, i + 1)

    knowledge.forEach(r => {
      const ref = r[REF]
      delete r[REF]
      var type = r[TYPE]
      delete r[TYPE]
      var upsert = r[UPSERT]
      delete r[UPSERT]
      if (!type) type =
        (!r.out && !r.in) ? VERTEX
        : !!(r.out && r.in) ? EDGE
        : null
      if (upsert === undefined) upsert = Object.keys(r)
      if (type === VERTEX) {
        const existing = addHas(this.v(), upsert, r)
        const v = upsert && existing.first() &&
          Object.assign(existing.first()) ||
          this.addVertex(r).first()

        if (ref) refs[ref] = v
      } else if (type === EDGE) {
        if (!refs[r.out]) throw new Error(`Unknown out ref: ${r.out}`)
        if (!refs[r.in]) throw new Error(`Unknown in ref: ${r.in}`)
        r.out = refs[r.out][RID]
        r.in = refs[r.in][RID]
        const existing = addHas(this.e(), upsert, r)
        const e = upsert && existing.first() &&
          Object.assign(existing.first()) ||
          this.addEdge(this.v(r.out), this.v(r.in), r.label, r).first()
        if (ref) refs[ref] = e
      } else {
        throw new Error(`Unknown type: ${type}`)
      }
    })
    return refs
  }
}

class Traversal {
  constructor (graph, parent, nodes) {
    this.parent = parent
    this.graph = graph
    this.nodes = nodes
    this.name = null
  }
  _next (nodes) {
    return new Traversal(this.graph, this, nodes || this.nodes)
  }
  addEdge (label, other, obj) {
    assertIsTraversal(other)
    return merge(
      this,
      this.nodes.map(outV =>
        other.nodes.map(inV =>
          this.graph.addEdge(outV, inV, label, obj)
        )
      )
    )
  }
  has (obj) {
    const matcher = _.matches(obj)
    return this._next(this.nodes.filter(matcher))
  }
  hasNot (obj) {
    const matcher = _.matches(obj)
    return this._next(this.nodes.filter(n => !matcher(n)))
  }
  outE (label) {
    const key = outKey(label)
    return this._next(
      flatten(
        this.nodes
        .map(n => n[key] || [])
      )
      .map(rid => this.graph.nodes[rid])
    )
  }
  inE (label) {
    const key = inKey(label)
    return this._next(
      flatten(
        this.nodes
        .map(n => n[key] || [])
      )
      .map(rid => this.graph.nodes[rid])
    )
  }
  outV () {
    return this._next(
      this.nodes.map(n => n.out)
        .filter(truthy)
        .map(rid => this.graph.nodes[rid])
    )
  }
  inV () {
    return this._next(
      this.nodes.map(n => n.in)
        .filter(truthy)
        .map(rid => this.graph.nodes[rid])
    )
  }
  out (label) {
    return this.outE(label).inV()
  }
  in (label) {
    return this.inE(label).outV()
  }
  both (label) {
    return merge(this, [
      this.out(label),
      this.in(label)
    ])
  }
  bothV (label) {
    return merge(this, [
      this.outV(label),
      this.inV(label)
    ])
  }
  bothE (label) {
    return merge(this, [
      this.outE(label),
      this.inE(label)
    ])
  }
  dedup () {
    var rids = {}
    return this._next(
      this.nodes.filter((n) =>
        !rids[n[RID]] && (rids[n[RID]] = n)
      )
    )
  }
  or (conditions) {
    return this._boolean((a, b) => a || b, false, Array.from(arguments))
  }
  and (conditions) {
    return this._boolean((a, b) => a && b, true, Array.from(arguments))
  }
  except (conditions) {
    return this._boolean((a, b) => a && !b, true, Array.from(arguments))
  }
  retain (conditions) {
    return this.and(merge(this, conditions))
  }
  _boolean (operator, initial, conditions) {
    const results = conditions
      .map(merge)
      .map(x =>
        x.nodes
          .reduce((set, n) => {
            set[n[RID]] = n
            return set
          }, {})
      )
    const reduction = this.nodes.filter(n =>
      results.reduce((cond, set) => operator(cond, !!set[n[RID]]), initial)
    )
    return this._next(reduction)
  }
  as (name) {
    return Object.assign(this._next(), {name})
  }
  back (name) {
    return this.name === name ? this
      : this.parent && this.parent.back(name)
  }
  filter (predicate) {
    return this._next(this.nodes.filter(predicate))
  }
  interval (prop, lower, upper) {
    return this._next(this.nodes.filter(n => n[prop] >= lower && n[prop] < upper))
  }
  random (bias) {
    return this._next(this.nodes.filter(n => Math.random() < bias))
  }
  map (fields) {
    fields = flatten(Array.from(arguments)).concat(RID, TYPE)
    return this._next(this.nodes.map(n => _.pick(n, fields)))
  }
  select (names) {
    const named = {}
    const collect = (t) => {
      if (t) {
        collect(t.parent)
        if (t.name) named[t.name] = t.nodes
      }
    }
    collect()
    return this._next([named])
  }
  toArray () {
    return this.nodes.slice()
  }
  first () {
    return this.nodes[0] || null
  }
  remove () {
    this.nodes.forEach(n => this.graph.remove(n))
    return this._next([])
  }
}

module.exports = {
  RID,
  TYPE,
  VERTEX,
  EDGE,
  CLASS,
  REF,
  UPSERT,
  isTraversal,
  assertIsTraversal,
  isVertex,
  assertIsVertex,
  isEdge,
  assertIsEdge,
  isLabel,
  assertIsLabel,
  isNode,
  assertIsNode,
  flatten,
  merge,
  outKey,
  inKey,
  identity,
  truthy,
  Graph,
  Traversal
}
