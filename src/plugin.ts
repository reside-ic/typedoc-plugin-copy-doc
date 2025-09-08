import { Application, Comment, Context, Converter, DeclarationReflection, ProjectReflection, SignatureReflection } from "typedoc";
import { circularInheritanceMsg, failedToFindMsg, failedToParseEmptyMsg } from "./warnings.js";
import { DefaultMap } from "./fromTypeDoc.js";

type DeclarationOrSignatureRefl = DeclarationReflection | SignatureReflection

type ReflectionConfig = {
  reflection: DeclarationReflection,
  type: "declaration",
  name: string
} | {
  reflection: SignatureReflection,
  type: "signature",
  name: string
}

export class Plugin {
  private dependencies = new DefaultMap<
    ReflectionConfig,
    ReflectionConfig[]
  >(() => []);

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
      const rawReflection = project.reflections[id];
      if (!rawReflection) continue;

      if (rawReflection.variant !== "declaration" && rawReflection.variant !== "signature") continue;
      const reflection = rawReflection as DeclarationOrSignatureRefl;

      if (reflection.variant === "signature") {
        var reflectionCfg: ReflectionConfig = {
          reflection: reflection,
          type: "signature" as const,
          name: reflection.getFriendlyFullName()
        }
      } else if (reflection.variant === "declaration") {
        var reflectionCfg: ReflectionConfig = {
          reflection: reflection,
          type: "declaration" as const,
          name: reflection.getFriendlyFullName()
        }
      } else {
        continue;
      }
      
      const sources = this.extractCopyDocTagReferences(reflectionCfg);

      sources?.forEach(source => {
        if (reflectionCfg.type === "signature") {
          var sourceReflection: DeclarationOrSignatureRefl | undefined =
            allReflections.signatures.find(r => r.getFriendlyFullName() === source);
          if (!sourceReflection) {
            sourceReflection = allReflections.declarations.find(r => r.getFriendlyFullName() === source);
          }
        } else {
          var sourceReflection: DeclarationOrSignatureRefl | undefined =
            allReflections.declarations.find(r => r.getFriendlyFullName() === source);
          if (!sourceReflection) {
            sourceReflection = allReflections.signatures.find(r => r.getFriendlyFullName() === source);
          }
        }

        if (!sourceReflection) {
          const warning = failedToFindMsg(source, reflectionCfg.name);
          this.app.logger.warn(warning);
          return;
        }

        const sourceReflectionCfg = {
          reflection: sourceReflection,
          type: sourceReflection.variant,
          name: sourceReflection.getFriendlyFullName()
        };

        this.mergeDocs(sourceReflectionCfg as ReflectionConfig, reflectionCfg);
      });
    }

    this.createCircularDependencyWarnings();
    this.dependencies.clear();
  };

  // from https://github.com/TypeStrong/typedoc/blob/1269e3ab6d169e89724328ada21a14ecaba89525/src/lib/converter/plugins/InheritDocPlugin.ts#L186
  private createCircularDependencyWarnings() {
    const unwarned = new Set(this.dependencies.keys());

    const generateWarning = (orig: ReflectionConfig) => {
      const parts = [orig.name];
      unwarned.delete(orig);
      let work = orig;

      do {
        const tmpWork = this.dependencies.getNoInsert(work);
        if (!tmpWork) break;
        work = tmpWork[0]!;
        unwarned.delete(work);
        parts.push(work.name);
      } while (!this.dependencies.getNoInsert(work)?.includes(orig));
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

  private mergeDocs = (sourceReflectionCfg: ReflectionConfig, targetReflectionCfg: ReflectionConfig) => {
    // if source reflection also has @copyDoc add it to dependency set to resolve later
    if (this.extractCopyDocTagReferences(sourceReflectionCfg)) {
      this.dependencies.get(sourceReflectionCfg).push(targetReflectionCfg);
      return;
    }

    const { reflection: targetReflection, type: targetType } = targetReflectionCfg;
    const { reflection: sourceReflection, type: sourceType } = sourceReflectionCfg;

    const comment = targetReflection.comment;
    const sourceComment = sourceReflection.comment;
    if (!comment) return;

    comment.removeTags("@copyDoc");

    // if no target summary use source summary
    if (!comment.summary.length && sourceComment?.summary) {
      comment.summary = Comment.cloneDisplayParts(sourceComment.summary);
    }

    if ("typeParameters" in targetReflection && "typeParameters" in sourceReflection) {
      this.matchAndCopyTypeParameterComments(sourceReflection, targetReflection);
    }

    if (targetType === "signature" && sourceType === "signature") {
        this.matchAndCopyParameterComments(sourceReflection, targetReflection);
        this.matchAndCopyTypeParameterComments(sourceReflection, targetReflection);
    }

    // Now copy the comment for anyone who depends on me.
    const dependent = this.dependencies.get(targetReflectionCfg);
    this.dependencies.delete(targetReflectionCfg);
    for (const targetReflectionCfg2 of dependent) {
      this.mergeDocs(targetReflectionCfg, targetReflectionCfg2);
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
  private extractCopyDocTagReferences = (reflectionCfg: ReflectionConfig) => {
    const { reflection, name } = reflectionCfg;
    const comment = reflection.comment;
    if (!comment) return;

    const blockTags = comment.blockTags.filter(t => t.tag === "@copyDoc");
    if (blockTags.length === 0) return;

    const references = [];
    for (let i = 0; i < blockTags.length; i++) {
      const content = blockTags[i]?.content[0];
      
      if (!content) {
        const warning = failedToParseEmptyMsg(name);
        this.app.logger.warn(warning);
      } else {
        references.push(content.text);
      }
    }

    return references;
  };

  // recurse down tree from project reflection to get all declaration reflections
  private getAllReflections = (baseReflection: ProjectReflection | DeclarationOrSignatureRefl) => {
    let subDeclReflections: DeclarationReflection[] = [];
    let subSigReflections: SignatureReflection[] = [];

    if ("children" in baseReflection) {
      subDeclReflections = [...subDeclReflections, ...baseReflection.children ?? []];
    }
    if ("signatures" in baseReflection) {
      subSigReflections = [...subSigReflections, ...baseReflection.signatures ?? []];
    }

    const allReflections = { declarations: subDeclReflections, signatures: subSigReflections };

    allReflections.declarations.forEach(r => {
      const { declarations, signatures } = this.getAllReflections(r);
      allReflections.declarations.push(...declarations);
      allReflections.signatures.push(...signatures);
    });
    
    return allReflections;
  };
}
