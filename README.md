# In memory graph

Usage:

```javascript
const { Graph } = require('memory-graph')

const g = new Graph()
const v1 = g.addVertex({name: 'Tom Hanks'})
const v2 = g.addVertex({name: 'Forest Gump'})
const e = g.addEdge(v1, v2, 'actedIn')

const actors = g.v()
  .has({name: 'Forest Gump'})
  .in('actedIn')
  .toArray()
  .map(v => v.name)
```

More docs to come...
