import * as Y from "yjs";
import { AffineSchemas, __unstableSchemas } from "@blocksuite/blocks";
import {
  BlobStorage,
  DocProviderCreator,
  Schema,
  Workspace,
} from "@blocksuite/store";

export function createWorkspaceFromUpdate(id: string, update: Uint8Array) {
  const providerCreators: DocProviderCreator[] = [];
  const blobStorages: ((id: string) => BlobStorage)[] = [];
  const schema = new Schema();
  schema.register(AffineSchemas).register(__unstableSchemas);

  const options = {
    id,
    schema,
    providerCreators,
    blobStorages,
  };

  const workspace = new Workspace(options);
  Y.applyUpdate(workspace.doc, update);

  return workspace;
}

export async function createPageFromUpdate(
  id: string,
  workspace: Workspace,
  update: Uint8Array
) {
  if (workspace.getPage(id)) {
    throw new Error(`Page ${id} already exists in workspace`);
  }
  const page = workspace.createPage(id);
  await page.load(() => Y.applyUpdate(page.spaceDoc, update));
  return page;
}
