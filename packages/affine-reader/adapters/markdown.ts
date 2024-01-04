import type { DeltaInsert } from "@blocksuite/inline";
import {
  ASTWalker,
  BlockSnapshotSchema,
  Job,
  Page,
  getAssetName,
  type AssetsManager,
  type BlockSnapshot,
} from "@blocksuite/store";
import { format } from "date-fns/format";
import type { Heading, Root, RootContentMap, TableRow } from "mdast";
import { unified } from "unified";

import type { Column, SerializedCells } from "@blocksuite/blocks";

import { remarkGfm } from "@blocksuite/blocks/dist/_common/adapters/gfm";
import "remark-parse";
import remarkStringify from "remark-stringify";

export type Markdown = string;

type MarkdownAST = RootContentMap[keyof RootContentMap] | Root;

function deltaToMdAST(deltas: DeltaInsert[], depth = 0) {
  if (depth > 0) {
    deltas.unshift({ insert: " ".repeat(4).repeat(depth) });
  }
  return deltas.map((delta) => {
    let mdast: MarkdownAST = {
      type: "text",
      value: delta.attributes?.underline
        ? `<u>${delta.insert}</u>`
        : delta.insert,
    };
    if (delta.attributes?.code) {
      mdast = {
        type: "inlineCode",
        value: delta.insert,
      };
    }
    if (delta.attributes?.bold) {
      mdast = {
        type: "strong",
        children: [mdast],
      };
    }
    if (delta.attributes?.italic) {
      mdast = {
        type: "emphasis",
        children: [mdast],
      };
    }
    if (delta.attributes?.strike) {
      mdast = {
        type: "delete",
        children: [mdast],
      };
    }
    if (delta.attributes?.link) {
      if (delta.insert === "") {
        mdast = {
          type: "text",
          value: delta.attributes.link,
        };
      } else if (delta.insert !== delta.attributes.link) {
        mdast = {
          type: "link",
          url: delta.attributes.link,
          children: [mdast],
        };
      }
    }
    return mdast;
  });
}

export async function traverseSnapshot(
  snapshot: BlockSnapshot,
  markdown: MarkdownAST,
  assets?: AssetsManager
) {
  const assetsIds: string[] = [];
  const walker = new ASTWalker<BlockSnapshot, MarkdownAST>();
  walker.setONodeTypeGuard(
    (node): node is BlockSnapshot => BlockSnapshotSchema.safeParse(node).success
  );
  walker.setEnter(async (o, context) => {
    const text = (o.node.props.text ?? { delta: [] }) as {
      delta: DeltaInsert[];
    };
    const currentTNode = context.currentNode();
    switch (o.node.flavour) {
      case "affine:code": {
        context
          .openNode(
            {
              type: "code",
              lang: (o.node.props.language as string) ?? null,
              meta: null,
              value: text.delta.map((delta) => delta.insert).join(""),
            },
            "children"
          )
          .closeNode();
        break;
      }
      case "affine:paragraph": {
        const paragraphDepth = (context.getGlobalContext(
          "affine:paragraph:depth"
        ) ?? 0) as number;
        switch (o.node.props.type) {
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6": {
            context
              .openNode(
                {
                  type: "heading",
                  depth: parseInt(o.node.props.type[1]) as Heading["depth"],
                  children: deltaToMdAST(text.delta, paragraphDepth),
                },
                "children"
              )
              .closeNode();
            break;
          }
          case "text": {
            context
              .openNode(
                {
                  type: "paragraph",
                  children: deltaToMdAST(text.delta, paragraphDepth),
                },
                "children"
              )
              .closeNode();
            break;
          }
          case "quote": {
            context
              .openNode(
                {
                  type: "blockquote",
                  children: [],
                },
                "children"
              )
              .openNode(
                {
                  type: "paragraph",
                  children: deltaToMdAST(text.delta),
                },
                "children"
              )
              .closeNode()
              .closeNode();
            break;
          }
        }
        context.setGlobalContext("affine:paragraph:depth", paragraphDepth + 1);
        break;
      }
      case "affine:list": {
        // check if the list is of the same type
        // if true, add the list item to the list
        // if false, create a new list
        if (
          context.getNodeContext("affine:list:parent") === o.parent &&
          currentTNode.type === "list" &&
          currentTNode.ordered === (o.node.props.type === "numbered") &&
          currentTNode.children[0].checked ===
            (o.node.props.type === "todo"
              ? (o.node.props.checked as boolean)
              : undefined)
        ) {
          context
            .openNode(
              {
                type: "listItem",
                checked:
                  o.node.props.type === "todo"
                    ? (o.node.props.checked as boolean)
                    : undefined,
                children: [],
              },
              "children"
            )
            .openNode(
              {
                type: "paragraph",
                children: deltaToMdAST(text.delta),
              },
              "children"
            )
            .closeNode();
        } else {
          context
            .openNode(
              {
                type: "list",
                ordered: o.node.props.type === "numbered",
                children: [],
              },
              "children"
            )
            .setNodeContext("affine:list:parent", o.parent)
            .openNode(
              {
                type: "listItem",
                checked:
                  o.node.props.type === "todo"
                    ? (o.node.props.checked as boolean)
                    : undefined,
                children: [],
              },
              "children"
            )
            .openNode(
              {
                type: "paragraph",
                children: deltaToMdAST(text.delta),
              },
              "children"
            )
            .closeNode();
        }
        break;
      }
      case "affine:divider": {
        context
          .openNode(
            {
              type: "thematicBreak",
            },
            "children"
          )
          .closeNode();
        break;
      }
      case "affine:image": {
        const blobId = (o.node.props.sourceId ?? "") as string;
        if (!assets) {
          break;
        }
        await assets.readFromBlob(blobId);
        const blob = assets.getAssets().get(blobId);
        assetsIds.push(blobId);
        const blobName = getAssetName(assets.getAssets(), blobId);
        if (!blob) {
          break;
        }
        context
          .openNode(
            {
              type: "paragraph",
              children: [],
            },
            "children"
          )
          .openNode(
            {
              type: "image",
              url: `assets/${blobName}`,
              title: null,
              alt: (blob as File).name ?? null,
            },
            "children"
          )
          .closeNode()
          .closeNode();
        break;
      }
      case "affine:page": {
        const title = (o.node.props.title ?? { delta: [] }) as {
          delta: DeltaInsert[];
        };
        if (title.delta.length === 0) break;
        context
          .openNode(
            {
              type: "paragraph",
              children: deltaToMdAST(title.delta, 0),
            },
            "children"
          )
          .closeNode();
        break;
      }
      case "affine:database": {
        const rows: TableRow[] = [];
        const columns = o.node.props.columns as Array<Column>;
        const children = o.node.children;
        const cells = o.node.props.cells as SerializedCells;
        const createAstCell = (
          children: Record<string, string | undefined | unknown>[]
        ) => ({
          type: "tableCell",
          children,
        });
        const mdAstCells = Array.prototype.map.call(
          children,
          (v: BlockSnapshot) =>
            Array.prototype.map.call(columns, (col) => {
              const cell = cells[v.id]?.[col.id];
              let r;
              if (cell || col.type === "title") {
                switch (col.type) {
                  case "link":
                  case "progress":
                  case "number":
                    r = createAstCell([
                      {
                        type: "text",
                        value: cell.value,
                      },
                    ]);
                    break;
                  case "rich-text":
                    r = createAstCell([
                      {
                        type: "text",
                        value: (cell.value as { delta: DeltaInsert[] }).delta
                          .map((v) => v.insert)
                          .join(),
                      },
                    ]);
                    break;
                  case "title":
                    r = createAstCell([
                      {
                        type: "text",
                        value: (v.props.text as { delta: DeltaInsert[] }).delta
                          .map((v) => v.insert)
                          .join(""),
                      },
                    ]);
                    break;
                  case "date":
                    r = createAstCell([
                      {
                        type: "text",
                        value: format(
                          new Date(cell.value as number),
                          "yyyy-MM-dd"
                        ),
                      },
                    ]);
                    break;
                  case "select": {
                    const value = col.data.options.find(
                      (opt: Record<string, string>) => opt.id === cell.value
                    )?.value;
                    r = createAstCell([{ type: "text", value }]);
                    break;
                  }
                  case "multi-select": {
                    const value = Array.prototype.map
                      .call(
                        cell.value,
                        (val) =>
                          col.data.options.find(
                            (opt: Record<string, string>) => val === opt.id
                          ).value
                      )
                      .filter(Boolean)
                      .join(",");
                    r = createAstCell([{ type: "text", value }]);
                    break;
                  }
                  case "checkbox": {
                    r = createAstCell([{ type: "text", value: cell.value }]);
                    break;
                  }
                  default:
                    r = createAstCell([{ type: "text", value: "" }]);
                }
              } else {
                r = createAstCell([{ type: "text", value: "" }]);
              }
              return r;
            })
        );

        // Handle first row.
        if (Array.isArray(columns)) {
          rows.push({
            type: "tableRow",
            children: Array.prototype.map.call(columns, (v) =>
              createAstCell([
                {
                  type: "text",
                  value: v.name,
                },
              ])
            ) as [],
          });
        }

        // Handle 2-... rows
        Array.prototype.forEach.call(mdAstCells, (children) => {
          rows.push({ type: "tableRow", children });
        });

        context
          .openNode({
            type: "table",
            children: rows,
          })
          .closeNode();

        context.skipAllChildren();
        break;
      }
    }
  });
  walker.setLeave(async (o, context) => {
    const currentTNode = context.currentNode();
    switch (o.node.flavour) {
      case "affine:paragraph": {
        context.setGlobalContext(
          "affine:paragraph:depth",
          (context.getGlobalContext("affine:paragraph:depth") as number) - 1
        );
        break;
      }
      case "affine:list": {
        if (
          context.getNodeContext("affine:list:parent") === o.parent &&
          currentTNode.type === "list" &&
          currentTNode.ordered === (o.node.props.type === "numbered") &&
          currentTNode.children[0].checked ===
            (o.node.props.type === "todo"
              ? (o.node.props.checked as boolean)
              : undefined)
        ) {
          context.closeNode();
        } else {
          context.closeNode().closeNode();
        }
        break;
      }
    }
  });
  return {
    ast: (await walker.walk(snapshot, markdown)) as Root,
    assetsIds,
  };
}

export async function mdastToMarkdown(ast: Root) {
  return unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      resourceLink: true,
    })
    .stringify(ast)
    .replace(/&#x20;\n/g, " \n");
}

export async function pageToMarkdown(page: Page, assets?: AssetsManager) {
  const job = new Job({ workspace: page.workspace });
  const snapshot = await job.pageToSnapshot(page);
  const root: Root = {
    type: "root",
    children: [],
  };
  const { ast, assetsIds } = await traverseSnapshot(
    snapshot.blocks,
    root,
    assets
  );
  const markdown = await mdastToMarkdown(ast);
  return { markdown, assetsIds };
}
