import { Application, Comment, Context, Converter, DeclarationReflection, ProjectReflection, Reflection, SignatureReflection } from "typedoc";
import { circularInheritanceMsg, failedToFindMsg, failedToParseEmptyMsg, triedToCopyEmptyCommentMsg } from "./warnings.js";
import { DefaultMap } from "./fromTypeDoc.js";

type DeclarationOrSignatureRefl = DeclarationReflection | SignatureReflection

export class Plugin {
  private dependencies = new DefaultMap<DeclarationOrSignatureRefl, DeclarationReflection[]>(() => []);

  constructor(public app: Readonly<Application>) {
    // add copyDoc block tag
    app.on(Application.EVENT_BOOTSTRAP_END, () => {
      app.options.setValue("blockTags", [
        ...new Set([
          ...app.options.getValue("blockTags"),
          "@copyDoc"
        ])
      ]);
    });

    // process copy doc
    app.converter.on(
      Converter.EVENT_RESOLVE_END,
      this.processCopyDoc
    );
  };

  private processCopyDoc = (ctx: Readonly<Context>) => {
    const project = ctx.project;
    // get all reflections once to make it easy to resolve "@copyDoc <reference>"
    const allReflections = this.getAllReflections(project);

    for (const id in project.reflections) {
      const reflection = project.reflections[id];
      if (!reflection) continue;

      // only supporting declarations for now
      if (reflection.variant !== "declaration") continue;
      const declReflection = reflection as DeclarationReflection;

      const sources = this.extractCopyDocTagReferences(declReflection);
      sources?.forEach(source => {
        const sourceReflection = allReflections.find(r => r.name === source);

        if (!sourceReflection) {
          const warning = failedToFindMsg(source, declReflection.getFriendlyFullName());
          this.app.logger.warn(warning);
          return;
        }

        this.mergeDocs(sourceReflection, declReflection);
      });
    }

    this.createCircularDependencyWarnings();
    this.dependencies.clear();
  };

  // from https://github.com/TypeStrong/typedoc/blob/1269e3ab6d169e89724328ada21a14ecaba89525/src/lib/converter/plugins/InheritDocPlugin.ts#L186
  private createCircularDependencyWarnings() {
    const unwarned = new Set(this.dependencies.keys());

    const generateWarning = (orig: DeclarationOrSignatureRefl) => {
      const parts = [orig.name];
      unwarned.delete(orig);
      let work = orig;

      do {
        work = this.dependencies.get(work)[0]!;
        unwarned.delete(work);
        parts.push(work.name);
      } while (!this.dependencies.get(work).includes(orig as any));
      parts.push(orig.name);

      const warning = circularInheritanceMsg(parts.reverse().join(" -> "));
      this.app.logger.warn(warning);
    };

    for (const orig of this.dependencies.keys()) {
      if (unwarned.has(orig)) {
        generateWarning(orig);
      }
    }
  };

  private mergeDocs = (source: DeclarationOrSignatureRefl, target: DeclarationOrSignatureRefl) => {
    if (!target.comment) return;

    if (!source.comment) {
      const warning = triedToCopyEmptyCommentMsg(target.getFriendlyFullName(), source.getFriendlyFullName());
      this.app.logger.warn(warning);
      return;
    }

    if (this.extractCopyDocTagReferences(source)) {
      this.dependencies.get(source).push(target as DeclarationReflection);
      return;
    }

    target.comment.removeTags("@copyDoc");

    // if no target summary use source summary
    if (!target.comment.summary.length) {
      target.comment.summary = Comment.cloneDisplayParts(source.comment.summary);
    }

    if ("typeParameters" in target && "typeParameters" in source) {
      this.matchAndCopyTypeParameterComments(source, target);
    }

    if ("signatures" in target && target.signatures && "signatures" in source && source.signatures) {
      target.signatures.forEach(targetSig => {
        source.signatures?.forEach(sourceSig => {
          this.matchAndCopyParameterComments(sourceSig, targetSig);
          this.matchAndCopyTypeParameterComments(sourceSig, targetSig);
        });
      });
    }

    // Now copy the comment for anyone who depends on me.
    const dependent = this.dependencies.get(target);
    this.dependencies.delete(target);
    for (const target2 of dependent) {
      this.mergeDocs(target, target2);
    }
  };

  // copy matching source @typeParam if target doesn't have a comment
  private matchAndCopyTypeParameterComments = (source: DeclarationOrSignatureRefl, target: DeclarationOrSignatureRefl) => {
    const targetParams = target.typeParameters;
    const sourceParams = source.typeParameters;
    if (!targetParams || !sourceParams) return;

    targetParams.forEach(tp => {
      const match = sourceParams.find(sp => sp.name === tp.name);
      if (!match) return;
      if (!tp.comment) tp.comment = match.comment;
    });
  };

  // copy matching source @param if target doesn't have a comment
  private matchAndCopyParameterComments = (source: SignatureReflection, target: SignatureReflection) => {
    const targetParams = target.parameters;
    const sourceParams = source.parameters;
    if (!targetParams || !sourceParams) return;

    targetParams.forEach(tp => {
      const match = sourceParams.find(sp => sp.name === tp.name);
      if (!match) return;
      if (!tp.comment) tp.comment = match.comment;
    });
  };

  // extract all copyDoc tags, there may be multiple
  private extractCopyDocTagReferences = (reflection: Reflection) => {
    const comment = reflection.comment;
    if (!comment) return;

    const blockTags = comment.blockTags.filter(t => t.tag === "@copyDoc");
    if (blockTags.length === 0) return;

    const references = [];
    for (let i = 0; i < blockTags.length; i++) {
      const content = blockTags[i]?.content[0];
      
      if (!content) {
        const warning = failedToParseEmptyMsg(reflection.getFriendlyFullName());
        this.app.logger.warn(warning);
      } else {
        references.push(content.text);
      }
    }

    return references;
  };

  // recurse down tree from project reflection to get all declaration reflections
  private getAllReflections = (baseReflection: ProjectReflection | DeclarationOrSignatureRefl) => {
    let subReflections: DeclarationOrSignatureRefl[] = [];
    if ("children" in baseReflection) {
      subReflections = [...subReflections, ...baseReflection.children ?? []];
    }
    if ("signatures" in baseReflection) {
      subReflections = [...subReflections, ...baseReflection.signatures ?? []];
    }

    const allReflections = [...subReflections];

    subReflections.forEach(r => {
      allReflections.push(...this.getAllReflections(r));
    });
    
    return allReflections;
  };
}
