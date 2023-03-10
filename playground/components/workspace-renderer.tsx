import { getBlocksuiteReader } from "@/../packages/affine-reader/dist";

import "./prism.css";

import { use } from "react";
import { mdToHTML } from "./md-to-html";
import styles from "./workspace-renderer.module.css";

export function WorkspaceRenderer({ workspaceId }: { workspaceId: string }) {
  const reader = getBlocksuiteReader({
    workspaceId,
  });
  const pages = use(reader.getWorkspacePages(true));

  return (
    <div className={styles.root}>
      {pages
        ? pages.map((page) => (
            <fieldset key={page.id} className={styles.pageContainer}>
              <legend className={styles.legend}>
                {page.title} |<code>{page.id}</code>
              </legend>
              {page.md && (
                <section className={styles.twoColumnWrapper}>
                  <article className={styles.page}>
                    <pre className={styles.markdown}>{page.md}</pre>
                  </article>
                  <article className={styles.page}>
                    <div
                      dangerouslySetInnerHTML={{ __html: mdToHTML(page.md) }}
                    />
                  </article>
                </section>
              )}
            </fieldset>
          ))
        : "failed to load pages"}
    </div>
  );
}
