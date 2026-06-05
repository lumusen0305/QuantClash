"""DAG validation: ensures no cycles, valid node types, path from START to END."""

from collections import defaultdict, deque
from app.strategies.node_registry import NODE_REGISTRY


class DAGValidationError(ValueError):
    pass


def validate_dag(dag_config: dict) -> None:
    nodes = dag_config.get("nodes", [])
    edges = dag_config.get("edges", [])

    if not nodes:
        raise DAGValidationError("DAG must have at least one node")
    if not edges:
        raise DAGValidationError("DAG must have at least one edge")

    node_ids = {n["id"] for n in nodes}
    all_ids = node_ids | {"START", "END"}

    # Validate node types exist in registry
    for node in nodes:
        if node["type"] not in NODE_REGISTRY:
            raise DAGValidationError(f"Unknown node type: {node['type']}")

    # Validate edges reference valid nodes
    for edge in edges:
        if edge["from"] not in all_ids:
            raise DAGValidationError(f"Edge references unknown source: {edge['from']}")
        if edge["to"] not in all_ids:
            raise DAGValidationError(f"Edge references unknown target: {edge['to']}")

    # Check START has outgoing edges
    start_edges = [e for e in edges if e["from"] == "START"]
    if not start_edges:
        raise DAGValidationError("DAG must have at least one edge from START")

    # Check END has incoming edges
    end_edges = [e for e in edges if e["to"] == "END"]
    if not end_edges:
        raise DAGValidationError("DAG must have at least one edge to END")

    # Check for cycles using topological sort (Kahn's algorithm)
    adj = defaultdict(list)
    in_degree = defaultdict(int)
    for nid in all_ids:
        in_degree[nid] = 0
    for edge in edges:
        adj[edge["from"]].append(edge["to"])
        in_degree[edge["to"]] += 1

    queue = deque([nid for nid in all_ids if in_degree[nid] == 0])
    visited_count = 0
    while queue:
        node = queue.popleft()
        visited_count += 1
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if visited_count != len(all_ids):
        raise DAGValidationError("DAG contains a cycle")

    # Check reachability: START can reach END
    visited = set()
    bfs = deque(["START"])
    while bfs:
        node = bfs.popleft()
        if node in visited:
            continue
        visited.add(node)
        for neighbor in adj[node]:
            bfs.append(neighbor)

    if "END" not in visited:
        raise DAGValidationError("No path from START to END")
