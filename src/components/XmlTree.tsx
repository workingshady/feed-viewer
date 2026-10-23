import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ParsedXmlNode } from "@/lib/types";

export default function XmlTree({ nodes, defaultOpenDepth = 2 }: { nodes: ParsedXmlNode[]; defaultOpenDepth?: number }) {
  return (
    <div className="p-2">
      {nodes.map((node, i) => (
        <XmlTreeNode key={`${node.path}-${i}`} node={node} depth={0} defaultOpenDepth={defaultOpenDepth} />
      ))}
    </div>
  );
}

function XmlTreeNode({ node, depth, defaultOpenDepth }: { node: ParsedXmlNode; depth: number; defaultOpenDepth: number }) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);
  const hasChildren = node.children.length > 0;
  const hasAttrs = Object.keys(node.attributes || {}).length > 0;

  return (
    <div>
      <button
        type="button"
        disabled={!hasChildren}
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => hasChildren && setOpen(!open)}
        className={`flex items-center gap-1 py-1 px-2 w-full text-left text-sm hover:bg-accent rounded transition-colors ${
          hasChildren ? "cursor-pointer" : "cursor-default opacity-90"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        <span className="font-mono text-xs text-primary-text">{node.name}</span>
        {node.count > 1 && <span className="text-xs text-muted-foreground ml-1">×{node.count}</span>}
        {hasAttrs && <span className="text-[11px] text-muted-foreground ml-2">attrs</span>}
        {!hasChildren ? (
          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[280px]">
            = "{node.value ?? ""}"
          </span>
        ) : null}
      </button>

      {open && hasChildren && node.children.map((child, i) => (
        <XmlTreeNode key={`${child.path}-${i}`} node={child} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
      ))}
    </div>
  );
}

