import {NodePath} from '@babel/traverse'
import {ImportDeclaration, Program, Statement, VariableDeclaration, VariableDeclarator} from '@babel/types'

export function isSupportHMR(path: NodePath<any>) {
  const parent = path.findParent((parent) =>
    !parent ||
    parent.isExportNamedDeclaration() ||
    parent.isExportDefaultDeclaration() ||
    parent.isArrowFunctionExpression() ||
    parent.isFunctionDeclaration() ||
    parent.isFunctionExpression() ||
    parent.isDeclareFunction()
  )

  return !parent || parent.isExportNamedDeclaration()
}

export function getUnitInitStatements(path: NodePath<Program>): { statements: Statement[]; declarations: VariableDeclaration[]; } {
    const statements: Statement[] = []
    const declarations: VariableDeclaration[] = []

    path.traverse({
        CallExpression: (call) => {
            if (
                call.node.callee.type !== 'Identifier' ||
                call.node.callee.name !== 'sample'
            ) {
                return
            }
    
            if (!isSupportHMR(call)) {
                return
            }

            statements.push({
                type: 'ExpressionStatement',
                expression: call.node,
            } as Statement)

            call.parentPath.remove();
        },
        
        VariableDeclaration(variable) {
            if (!isSupportHMR(variable)) {
              return
            }
    
            variable.traverse({
              CallExpression(call) {
                if (call.node.callee.type !== 'Identifier') {
                  return
                }
    
                const isInvoke = call.node.callee.name === 'invoke'
    
                if (!isSupportHMR(call) && !isInvoke) {
                  return
                }

                const isCreateUnitFunction = ['createEvent', 'createStore', 'createEffect'].includes(
                    call.node.callee.name,
                )
    
                if (!isCreateUnitFunction && !isInvoke) {
                  return
                }
    
                const declarationPath = call.findParent(parent => parent.isVariableDeclarator()) as NodePath<VariableDeclarator> | null

                if (!declarationPath) {
                  return
                }

                const {node: declaration} = declarationPath
    
                declarations.push({
                    type: 'VariableDeclaration',
                    kind: 'let',
                    declarations: [
                      {type: 'VariableDeclarator', id: declaration.id},
                    ],
                })

                statements.push({
                  type: 'ExpressionStatement',
                  expression: {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: declaration.id,
                    right: declaration.init!,
                  },
                })

                declarationPath.remove()
    
                if (variable.node?.declarations.length === 0) {
                  variable.parentPath.remove()
                }
              },
            })
        }
    })

    return {statements, declarations}
}

function updateEffectorImport(path: NodePath<Program>): { getNameWithModulePrefix: (name: string) => string, lastImport: NodePath<ImportDeclaration> | null } {
  let modulePrefix: string | null = null
  let lastImport: NodePath<ImportDeclaration> | null = null

  path.traverse({
    ImportDeclaration: (declaration) => {
      lastImport = declaration

      if (declaration.node.source.value !== 'effector') {
        return
      }

      if (declaration.node.specifiers.length === 1) {
        const specifier = declaration.node.specifiers[0]

        if (!specifier) {
          throw new Error()
        }

        modulePrefix = specifier.local.name
      } else {
        let needToImported = ['withRegion', 'createNode', 'clearNode']

        for (const specifier of declaration.node.specifiers) {
          needToImported = needToImported.filter(
            (unit) => unit !== specifier.local.name,
          )
        }

        for (const importName of needToImported) {
          declaration.node.specifiers.push({
            type: 'ImportSpecifier',
            local: {
              type: 'Identifier',
              name: importName,
            },
            imported: {
              type: 'Identifier',
              name: importName,
            },
          })
        }
      }
    }
  })

  return {
    getNameWithModulePrefix: (name) => modulePrefix ? `${modulePrefix}.${name}` : name,
    lastImport,
  }
}

export function modifyFile(path: NodePath<Program>) {
  const {declarations, statements} = getUnitInitStatements(path)

  if (!statements.length) {
    return
  }

  const {getNameWithModulePrefix, lastImport} = updateEffectorImport(path)

  if (!lastImport) {
    return
  }

  const initStatement: Statement = {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: getNameWithModulePrefix('withRegion'),
      },
      arguments: [
        {type: 'Identifier', name: '_internalHMRRegion'},
        {
          type: 'ArrowFunctionExpression',
          async: false,
          params: [],
          expression: false,
          body: {
            type: 'BlockStatement',
            body: declarations,
            directives: [],
          },
        },
      ],
    },
  }

  lastImport.insertAfter([
    {
      type: 'VariableDeclaration',
      kind: 'let',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: '_internalHMRRegion',
          },
          init: {
            type: 'CallExpression',
            callee: {type: 'Identifier', name: getNameWithModulePrefix('createNode')},
            arguments: [],
          },
        },
      ],
    },
    ...statements,
    initStatement,
  ])


  path.node.body.push(...[
    {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: '_internalHmrApi'
          },
        }
      ],
      kind: 'let',
    },
    {
      type: 'TryStatement',
      block: {
        type: 'BlockStatement',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: {
                type: 'Identifier',
                name: '_internalHmrApi'
              },
              right: {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: 'eval'
                },
                arguments: [
                  {
                    type: 'StringLiteral',
                    value: 'import.meta.hot ?? import.meta.webpackHot ?? module.hot'
                  }
                ]
              }
            }
          }
        ],
        directives: []
      },
      handler: {
        type: 'CatchClause',
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ThrowStatement',
              argument: {
                type: 'StringLiteral',
                extra: {
                  'rawValue': "[Effector HMR] Fatal error. Current environment doesn't support HMR API",
                  'raw': "'[Effector HMR] Fatal error. Current environment doesn\\'t support HMR API'"
                },
                value: "[Effector HMR] Fatal error. Current environment doesn't support HMR API"
              }
            }
          ],
          directives: []
        }
      },
    },
    {
      type: 'IfStatement',
      test: {
        type: 'Identifier',
        name: '_internalHmrApi',
      },
      consequent: {
        type: 'BlockStatement',
        directives: [],
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'CallExpression',
              callee: {
                type: 'MetaProperty',
                meta: {
                  type: 'Identifier',
                  name: '_internalHmrApi',
                },
                property: {
                  type: 'Identifier',
                  name: 'accept',
                },
                computed: false,
              },
              arguments: [
                {
                  type: 'ArrowFunctionExpression',
                  params: [],
                  async: false,
                  expression: false,
                  body: {
                    type: 'BlockStatement',
                    directives: [],
                    body: [
                      {
                        type: 'ExpressionStatement',
                        expression: {
                          type: 'CallExpression',
                          callee: {
                            type: 'Identifier',
                            name: getNameWithModulePrefix('clearNode'),
                          },
                          arguments: [
                            {type: 'Identifier', name: '_internalHMRRegion'},
                          ],
                        },
                      },
                      {
                        type: 'ExpressionStatement',
                        expression: {
                          type: 'AssignmentExpression',
                          operator: '=',
                          left: {
                            type: 'Identifier',
                            name: '_internalHMRRegion',
                          },
                          right: {
                            type: 'CallExpression',
                            callee: {
                              type: 'Identifier',
                              name: getNameWithModulePrefix('createNode'),
                            },
                            arguments: [],
                          },
                        },
                      },
                      initStatement,
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    }
  ] as Statement[]);
}
