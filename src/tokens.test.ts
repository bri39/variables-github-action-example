import { Token, generatePostVariablesPayload, readJsonFiles } from './tokens.js'
import FigmaApi, { ApiGetLocalVariablesResponse } from './figma_api.js'

jest.mock('./figma_api.js')

jest.mock('fs', () => {
  const MOCK_FILE_INFO: { [fileName: string]: string } = {
    'valid_file1.json': JSON.stringify({
      spacing: {
        '1': {
          $type: 'number',
          $value: 8,
        },
        '2': {
          $type: 'number',
          $value: 16,
        },
      },
    }),
    'valid_file2.json': JSON.stringify({
      color: {
        brand: {
          radish: {
            $type: 'color',
            $value: '#ffbe16',
          },
          pear: {
            $type: 'color',
            $value: '#ffbe16',
          },
        },
      },
    }),
    'valid_file3.json': JSON.stringify({
      token1: { $type: 'string', $value: 'value1' },
      token2: { $type: 'string', $value: 'value2' },
    }),
    'no_tokens.json': JSON.stringify({
      foo: 'bar',
    }),
  }

  return {
    readFileSync: (fpath: string) => {
      if (fpath in MOCK_FILE_INFO) {
        return MOCK_FILE_INFO[fpath]
      }
      throw 'unexpected fpath'
    },
  }
})

jest.mock('axios', () => {
  return {
    request: jest.fn(),
  }
})

describe('readJsonFiles', () => {
  it('reads all files and flattens tokens inside', () => {
    const result = readJsonFiles(['valid_file1.json', 'valid_file2.json', 'valid_file3.json'])
    expect(result).toEqual({
      'valid_file1.json': {
        'spacing/1': { $type: 'number', $value: 8 },
        'spacing/2': { $type: 'number', $value: 16 },
      },
      'valid_file2.json': {
        'color/brand/radish': { $type: 'color', $value: '#ffbe16' },
        'color/brand/pear': { $type: 'color', $value: '#ffbe16' },
      },
      'valid_file3.json': {
        token1: { $type: 'string', $value: 'value1' },
        token2: { $type: 'string', $value: 'value2' },
      },
    })
  })

  it('handles files that do not have any tokens', () => {
    const result = readJsonFiles(['no_tokens.json'])
    expect(result).toEqual({ 'no_tokens.json': {} })
  })
})

describe('generatePostVariablesPayload', () => {
  beforeEach(() => {})

  it('does an initial sync', async () => {
    ;(FigmaApi as any).mockImplementation(() => {
      return {
        getLocalVariables: async (_: string) => {
          return {
            status: 200,
            error: false,
            meta: {
              variableCollections: {},
              variables: {},
            },
          }
        },
      }
    })

    const tokensByFile: {
      [fileName: string]: {
        [tokenName: string]: Token
      }
    } = {
      'primitives.mode1.json': {
        'spacing/1': { $type: 'number', $value: 8 },
        'spacing/2': { $type: 'number', $value: 16 },
        'color/brand/radish': { $type: 'color', $value: '#ffbe16' },
        'color/brand/pear': { $type: 'color', $value: '#ffbe16' },
      },
      'primitives.mode2.json': {
        'spacing/1': { $type: 'number', $value: 8 },
        'spacing/2': { $type: 'number', $value: 16 },
        'color/brand/radish': { $type: 'color', $value: '#010101' },
        'color/brand/pear': { $type: 'color', $value: '#010101' },
      },
      'tokens.mode1.json': {
        'spacing/spacing-sm': { $type: 'number', $value: '{spacing.1}' },
        'surface/surface-brand': { $type: 'color', $value: '{color.brand.radish}' },
      },
      'tokens.mode2.json': {
        'spacing/spacing-sm': { $type: 'number', $value: '{spacing.1}' },
        'surface/surface-brand': { $type: 'color', $value: '{color.brand.pear}' },
      },
    }

    const result = await generatePostVariablesPayload(tokensByFile, 'access_token', 'file_key')
    expect(result.variableCollections).toEqual([
      {
        action: 'CREATE',
        id: 'primitives',
        name: 'primitives',
        initialModeId: 'mode1',
      },
      {
        action: 'CREATE',
        id: 'tokens',
        name: 'tokens',
        initialModeId: 'mode1',
      },
    ])

    expect(result.variableModes).toEqual([
      {
        action: 'UPDATE',
        id: 'mode1',
        name: 'mode1',
        variableCollectionId: 'primitives',
      },
      {
        action: 'CREATE',
        id: 'mode2',
        name: 'mode2',
        variableCollectionId: 'primitives',
      },
      {
        action: 'UPDATE',
        id: 'mode1',
        name: 'mode1',
        variableCollectionId: 'tokens',
      },
      {
        action: 'CREATE',
        id: 'mode2',
        name: 'mode2',
        variableCollectionId: 'tokens',
      },
    ])

    expect(result.variables).toEqual([
      // variables for the primitives collection
      {
        action: 'CREATE',
        id: 'spacing/1',
        name: 'spacing/1',
        variableCollectionId: 'primitives',
        resolvedType: 'FLOAT',
      },
      {
        action: 'CREATE',
        id: 'spacing/2',
        name: 'spacing/2',
        variableCollectionId: 'primitives',
        resolvedType: 'FLOAT',
      },
      {
        action: 'CREATE',
        id: 'color/brand/radish',
        name: 'color/brand/radish',
        variableCollectionId: 'primitives',
        resolvedType: 'COLOR',
      },
      {
        action: 'CREATE',
        id: 'color/brand/pear',
        name: 'color/brand/pear',
        variableCollectionId: 'primitives',
        resolvedType: 'COLOR',
      },

      // variables for the tokens collection
      {
        action: 'CREATE',
        id: 'spacing/spacing-sm',
        name: 'spacing/spacing-sm',
        variableCollectionId: 'tokens',
        resolvedType: 'FLOAT',
      },
      {
        action: 'CREATE',
        id: 'surface/surface-brand',
        name: 'surface/surface-brand',
        variableCollectionId: 'tokens',
        resolvedType: 'COLOR',
      },
    ])

    expect(result.variableModeValues).toEqual([
      // primitives, mode1
      { variableId: 'spacing/1', modeId: 'mode1', value: 8 },
      { variableId: 'spacing/2', modeId: 'mode1', value: 16 },
      {
        variableId: 'color/brand/radish',
        modeId: 'mode1',
        value: { r: 1, g: 0.7451, b: 0.08627 },
      },
      {
        variableId: 'color/brand/pear',
        modeId: 'mode1',
        value: { r: 1, g: 0.7451, b: 0.08627 },
      },

      // primitives, mode2
      { variableId: 'spacing/1', modeId: 'mode2', value: 8 },
      { variableId: 'spacing/2', modeId: 'mode2', value: 16 },
      {
        variableId: 'color/brand/radish',
        modeId: 'mode2',
        value: { r: 0.00392, g: 0.00392, b: 0.00392 },
      },
      {
        variableId: 'color/brand/pear',
        modeId: 'mode2',
        value: { r: 0.00392, g: 0.00392, b: 0.00392 },
      },

      // tokens, mode1
      {
        variableId: 'spacing/spacing-sm',
        modeId: 'mode1',
        value: { type: 'VARIABLE_ALIAS', id: 'spacing/1' },
      },
      {
        variableId: 'surface/surface-brand',
        modeId: 'mode1',
        value: { type: 'VARIABLE_ALIAS', id: 'color/brand/radish' },
      },

      // tokens, mode2
      {
        variableId: 'spacing/spacing-sm',
        modeId: 'mode2',
        value: { type: 'VARIABLE_ALIAS', id: 'spacing/1' },
      },
      {
        variableId: 'surface/surface-brand',
        modeId: 'mode2',
        value: { type: 'VARIABLE_ALIAS', id: 'color/brand/pear' },
      },
    ])
  })

  it('does an in-place update', async () => {
    ;(FigmaApi as any).mockImplementation(() => {
      return {
        getLocalVariables: async (_: string): Promise<ApiGetLocalVariablesResponse> => {
          return {
            status: 200,
            error: false,
            meta: {
              variableCollections: {
                'VariableCollectionId:1:1': {
                  id: 'VariableCollectionId:1:1',
                  name: 'primitives',
                  modes: [{ modeId: '1:0', name: 'mode1' }],
                  defaultModeId: '1:0',
                  remote: false,
                },
              },
              variables: {
                'VariableID:2:1': {
                  id: 'VariableID:2:1',
                  name: 'spacing/1',
                  key: 'variable_key',
                  variableCollectionId: 'VariableCollectionId:1:1',
                  resolvedType: 'FLOAT',
                  valuesByMode: {
                    '1:0': 8,
                  },
                  remote: false,
                },
                'VariableID:2:2': {
                  id: 'VariableID:2:2',
                  name: 'spacing/2',
                  key: 'variable_key2',
                  variableCollectionId: 'VariableCollectionId:1:1',
                  resolvedType: 'FLOAT',
                  valuesByMode: {
                    '1:0': 15, // Different from token value
                  },
                  remote: false,
                },
                'VariableID:2:3': {
                  id: 'VariableID:2:3',
                  name: 'color/brand/radish',
                  key: 'variable_key3',
                  variableCollectionId: 'VariableCollectionId:1:1',
                  resolvedType: 'COLOR',
                  valuesByMode: {
                    '1:0': { r: 1, g: 0.7450980392156863, b: 0.08627450980392157, a: 1 },
                  },
                  remote: false,
                },
                'VariableID:2:4': {
                  id: 'VariableID:2:4',
                  name: 'color/brand/pear',
                  key: 'variable_key4',
                  variableCollectionId: 'VariableCollectionId:1:1',
                  resolvedType: 'COLOR',
                  valuesByMode: {
                    // Different from token value
                    '1:0': { r: 1, g: 0, b: 0.08627450980392157, a: 1 },
                  },
                  remote: false,
                },
              },
            },
          }
        },
      }
    })

    const tokensByFile: {
      [fileName: string]: {
        [tokenName: string]: Token
      }
    } = {
      'primitives.mode1.json': {
        'spacing/1': { $type: 'number', $value: 8 },
        'spacing/2': { $type: 'number', $value: 16 },
        'color/brand/radish': { $type: 'color', $value: '#ffbe16' },
        'color/brand/pear': { $type: 'color', $value: '#ffbe16' },
      },
      'primitives.mode2.json': {
        'spacing/1': { $type: 'number', $value: 8 },
        'spacing/2': { $type: 'number', $value: 16 },
        'color/brand/radish': { $type: 'color', $value: '#010101' },
        'color/brand/pear': { $type: 'color', $value: '#010101' },
      },
      'tokens.mode1.json': {
        'spacing/spacing-sm': { $type: 'number', $value: '{spacing.1}' },
        'surface/surface-brand': { $type: 'color', $value: '{color.brand.radish}' },
      },
      'tokens.mode2.json': {
        'spacing/spacing-sm': { $type: 'number', $value: '{spacing.1}' },
        'surface/surface-brand': { $type: 'color', $value: '{color.brand.pear}' },
      },
    }

    const result = await generatePostVariablesPayload(tokensByFile, 'access_token', 'file_key')
    expect(result.variableCollections).toEqual([
      {
        action: 'CREATE',
        id: 'tokens',
        name: 'tokens',
        initialModeId: 'mode1',
      },
    ])

    expect(result.variableModes).toEqual([
      {
        action: 'CREATE',
        id: 'mode2',
        name: 'mode2',
        variableCollectionId: 'VariableCollectionId:1:1',
      },
      {
        action: 'UPDATE',
        id: 'mode1',
        name: 'mode1',
        variableCollectionId: 'tokens',
      },
      {
        action: 'CREATE',
        id: 'mode2',
        name: 'mode2',
        variableCollectionId: 'tokens',
      },
    ])

    expect(result.variables).toEqual([
      // variables for the tokens collection
      {
        action: 'CREATE',
        id: 'spacing/spacing-sm',
        name: 'spacing/spacing-sm',
        variableCollectionId: 'tokens',
        resolvedType: 'FLOAT',
      },
      {
        action: 'CREATE',
        id: 'surface/surface-brand',
        name: 'surface/surface-brand',
        variableCollectionId: 'tokens',
        resolvedType: 'COLOR',
      },
    ])

    expect(result.variableModeValues).toEqual([
      // primitives, mode1
      { variableId: 'VariableID:2:2', modeId: '1:0', value: 16 },
      {
        variableId: 'VariableID:2:4',
        modeId: '1:0',
        value: { r: 1, g: 0.7451, b: 0.08627 },
      },

      // primitives, mode2
      { variableId: 'VariableID:2:1', modeId: 'mode2', value: 8 },
      { variableId: 'VariableID:2:2', modeId: 'mode2', value: 16 },
      {
        variableId: 'VariableID:2:3',
        modeId: 'mode2',
        value: { r: 0.00392, g: 0.00392, b: 0.00392 },
      },
      {
        variableId: 'VariableID:2:4',
        modeId: 'mode2',
        value: { r: 0.00392, g: 0.00392, b: 0.00392 },
      },

      // tokens, mode1
      {
        variableId: 'spacing/spacing-sm',
        modeId: 'mode1',
        value: { type: 'VARIABLE_ALIAS', id: 'VariableID:2:1' },
      },
      {
        variableId: 'surface/surface-brand',
        modeId: 'mode1',
        value: { type: 'VARIABLE_ALIAS', id: 'VariableID:2:3' },
      },

      // tokens, mode2
      {
        variableId: 'spacing/spacing-sm',
        modeId: 'mode2',
        value: { type: 'VARIABLE_ALIAS', id: 'VariableID:2:1' },
      },
      {
        variableId: 'surface/surface-brand',
        modeId: 'mode2',
        value: { type: 'VARIABLE_ALIAS', id: 'VariableID:2:4' },
      },
    ])
  })
})