from fastapi import APIRouter
from app.strategies.node_registry import NODE_REGISTRY, list_nodes_by_category

router = APIRouter()


@router.get("")
async def list_nodes():
    return {
        "nodes": {
            node_type: {
                "name": info["name"],
                "category": info["category"],
                "description": info["description"],
                "config_schema": info["config_schema"],
                "input_keys": info["input_keys"],
                "output_keys": info["output_keys"],
            }
            for node_type, info in NODE_REGISTRY.items()
        },
        "categories": list_nodes_by_category(),
    }
