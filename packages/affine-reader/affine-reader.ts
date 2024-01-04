import * as Y from "yjs";
import { pageDocToMD, workspaceDocToPagesMeta } from "./parser";
import {
  createWorkspaceFromUpdate,
  createPageFromUpdate,
} from "./adapters/blocksuite";
import { pageToMarkdown } from "./adapters/markdown";

interface ReaderConfig {
  workspaceId: string; // root workspace id
  sessionToken?: string; // for auth
  target?: string; // e.g. https://insider.affine.pro
  Y?: typeof Y;
  // given a blob id, return a url to the blob
  blobUrlHandler?: (blobId: string) => string;
}

const defaultResourcesUrls = {
  doc: (target: string, workspaceId: string, docId: string) => {
    return `${target}/api/workspaces/${workspaceId}/docs/${docId}`;
  },
  blob: (target: string, workspaceId: string, blobId: string) => {
    return `${target}/api/workspaces/${workspaceId}/blobs/${blobId}`;
  },
};

export const getBlocksuiteReader = (config: ReaderConfig) => {
  const target = config.target || "https://insider.affine.pro";
  const workspaceId = config.workspaceId;

  const YY = config.Y || Y;

  if (!workspaceId) {
    throw new Error("Workspace ID and target are required");
  }

  const getFetchHeaders = () => {
    const headers: HeadersInit = {};
    if (config.sessionToken) {
      const isSecure = target.startsWith("https://");
      const cookie = `${isSecure ? "__Secure-" : ""}next-auth.session-token=${
        config.sessionToken
      }`;
      headers["Cookie"] = cookie;
    }
    return headers;
  };

  /**
   * Get doc binary by id
   *
   * @param docId
   * @returns
   */
  const getDocBinary = async (docId = workspaceId) => {
    try {
      const url = defaultResourcesUrls.doc(target, workspaceId, docId);
      const response = await fetch(url, {
        cache: "no-cache",
        headers: getFetchHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Error getting workspace doc: ${response.status} ${response.statusText}`
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      console.error("Error getting workspace doc: ", err);
      return null;
    }
  };

  /**
   * Get blob by id
   *
   * @param blobId
   * @returns
   */
  const getBlob = async (blobId: string) => {
    const url = defaultResourcesUrls.blob(target, workspaceId, blobId);
    try {
      const res = await fetch(url, {
        cache: "no-cache",
        headers: getFetchHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Error getting blob: ${res.status} ${res.statusText}`);
      }

      return res.blob();
    } catch (err) {
      console.error("Error getting blob: ", err);
      return null;
    }
  };

  /**
   * Get doc by id
   *
   * @param docId
   * @returns
   */
  const getDoc = async (docId = workspaceId) => {
    const updates = await getDocBinary(docId);
    if (!updates) {
      return null;
    }
    try {
      const doc = new YY.Doc();
      YY.applyUpdate(doc, updates);
      return doc;
    } catch (err) {
      console.error(`Error applying update, ${docId}: `, err);
      return null;
    }
  };

  const getDocPageMetas = async (docId = workspaceId) => {
    const doc = await getDoc(docId);
    if (!doc) {
      return null;
    }
    const pageMetas = workspaceDocToPagesMeta(doc);
    return pageMetas;
  };

  const defaultBlobUrlHandler = (id: string) =>
    defaultResourcesUrls.blob(target, workspaceId, id);

  const getDocMarkdown = async (docId = workspaceId) => {
    const [rootDocUpdate, pageDocUpdate] = await Promise.all([
      getDocBinary(workspaceId), // cache root doc?
      getDocBinary(docId),
    ]);
    if (!rootDocUpdate || !pageDocUpdate) {
      return null;
    }
    const workspace = createWorkspaceFromUpdate(workspaceId, rootDocUpdate);
    const page = await createPageFromUpdate(docId, workspace, pageDocUpdate);

    const markdown = pageToMarkdown(page);
    return markdown;
  };

  return {
    getBlob,
    getDoc,
    getDocBinary,
    getDocPageMetas,
    getDocMarkdown,
  };
};
