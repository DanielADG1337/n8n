import { INodeCredentialDescription } from './../../../workflow/src/Interfaces';
import {
	CORE_NODES_CATEGORY,
	RECOMMENDED_CATEGORY,
	CUSTOM_NODES_CATEGORY,
	SUBCATEGORY_DESCRIPTIONS,
	UNCATEGORIZED_CATEGORY,
	UNCATEGORIZED_SUBCATEGORY,
	PERSONALIZED_CATEGORY,
	NON_ACTIVATABLE_TRIGGER_NODE_TYPES,
	TEMPLATES_NODES_FILTER,
	REGULAR_NODE_FILTER,
	TRIGGER_NODE_FILTER,
	ALL_NODE_FILTER,
	MAPPING_PARAMS,
} from '@/constants';
import {
	INodeCreateElement,
	ICategoriesWithNodes,
	INodeUi,
	ITemplatesNode,
	INodeItemProps,
	NodeAuthenticationOption,
} from '@/Interface';
import {
	IDataObject,
	INodeExecutionData,
	INodeProperties,
	INodeTypeDescription,
	INodeActionTypeDescription,
	NodeParameterValueType,
	INodePropertyOptions,
	INodePropertyCollection,
} from 'n8n-workflow';
import { isResourceLocatorValue, isJsonKeyObject } from '@/utils';

/*
	Constants and utility functions mainly used to get information about
	or manipulate node types and nodes.
*/

const CRED_KEYWORDS_TO_FILTER = ['API', 'OAuth1', 'OAuth2'];
const NODE_KEYWORDS_TO_FILTER = ['Trigger'];
const COMMUNITY_PACKAGE_NAME_REGEX = /(@\w+\/)?n8n-nodes-(?!base\b)\b\w+/g;

const addNodeToCategory = (
	accu: ICategoriesWithNodes,
	nodeType: INodeTypeDescription | INodeActionTypeDescription,
	category: string,
	subcategory: string,
) => {
	if (!accu[category]) {
		accu[category] = {};
	}
	if (!accu[category][subcategory]) {
		accu[category][subcategory] = {
			triggerCount: 0,
			regularCount: 0,
			nodes: [],
		};
	}
	const isTrigger = nodeType.group.includes('trigger');
	if (isTrigger) {
		accu[category][subcategory].triggerCount++;
	}
	if (!isTrigger) {
		accu[category][subcategory].regularCount++;
	}
	accu[category][subcategory].nodes.push({
		type: nodeType.actionKey ? 'action' : 'node',
		key: `${category}_${nodeType.name}`,
		category,
		properties: {
			nodeType,
			subcategory,
		},
		includedByTrigger: isTrigger,
		includedByRegular: !isTrigger,
	});
};

export const getCategoriesWithNodes = (
	nodeTypes: INodeTypeDescription[],
	personalizedNodeTypes: string[],
	uncategorizedSubcategory = UNCATEGORIZED_SUBCATEGORY,
): ICategoriesWithNodes => {
	const sorted = [...nodeTypes].sort((a: INodeTypeDescription, b: INodeTypeDescription) =>
		a.displayName > b.displayName ? 1 : -1,
	);
	const result = sorted.reduce((accu: ICategoriesWithNodes, nodeType: INodeTypeDescription) => {
		if (personalizedNodeTypes.includes(nodeType.name)) {
			addNodeToCategory(accu, nodeType, PERSONALIZED_CATEGORY, uncategorizedSubcategory);
		}

		if (!nodeType.codex || !nodeType.codex.categories) {
			addNodeToCategory(accu, nodeType, UNCATEGORIZED_CATEGORY, uncategorizedSubcategory);
			return accu;
		}

		nodeType.codex.categories.forEach((_category: string) => {
			const category = _category.trim();
			const subcategories = nodeType?.codex?.subcategories?.[category] ?? null;

			if (subcategories === null || subcategories.length === 0) {
				addNodeToCategory(accu, nodeType, category, uncategorizedSubcategory);
				return;
			}

			subcategories.forEach((subcategory) => {
				addNodeToCategory(accu, nodeType, category, subcategory);
			});
		});
		return accu;
	}, {});
	return result;
};

const getCategories = (categoriesWithNodes: ICategoriesWithNodes): string[] => {
	const excludeFromSort = [
		CORE_NODES_CATEGORY,
		CUSTOM_NODES_CATEGORY,
		UNCATEGORIZED_CATEGORY,
		PERSONALIZED_CATEGORY,
		RECOMMENDED_CATEGORY,
	];
	const categories = Object.keys(categoriesWithNodes);
	const sorted = categories.filter((category: string) => !excludeFromSort.includes(category));
	sorted.sort();

	return [
		RECOMMENDED_CATEGORY,
		CORE_NODES_CATEGORY,
		CUSTOM_NODES_CATEGORY,
		PERSONALIZED_CATEGORY,
		...sorted,
		UNCATEGORIZED_CATEGORY,
	];
};

export const getCategorizedList = (
	categoriesWithNodes: ICategoriesWithNodes,
	categoryIsExpanded = false,
): INodeCreateElement[] => {
	const categories = getCategories(categoriesWithNodes);

	const result = categories.reduce((accu: INodeCreateElement[], category: string) => {
		if (!categoriesWithNodes[category]) {
			return accu;
		}

		const categoryEl: INodeCreateElement = {
			type: 'category',
			key: category,
			category,
			properties: {
				expanded: categoryIsExpanded,
			},
		};

		const subcategories = Object.keys(categoriesWithNodes[category]);
		if (subcategories.length === 1) {
			const subcategory = categoriesWithNodes[category][subcategories[0]];
			if (subcategory.triggerCount > 0) {
				categoryEl.includedByTrigger = subcategory.triggerCount > 0;
			}
			if (subcategory.regularCount > 0) {
				categoryEl.includedByRegular = subcategory.regularCount > 0;
			}
			return [...accu, categoryEl, ...subcategory.nodes];
		}

		subcategories.sort();
		const subcategorized = subcategories.reduce(
			(accu: INodeCreateElement[], subcategory: string) => {
				const subcategoryEl: INodeCreateElement = {
					type: 'subcategory',
					key: `${category}_${subcategory}`,
					category,
					properties: {
						subcategory,
						description: SUBCATEGORY_DESCRIPTIONS[category][subcategory],
					},
					includedByTrigger: categoriesWithNodes[category][subcategory].triggerCount > 0,
					includedByRegular: categoriesWithNodes[category][subcategory].regularCount > 0,
				};

				if (subcategoryEl.includedByTrigger) {
					categoryEl.includedByTrigger = true;
				}
				if (subcategoryEl.includedByRegular) {
					categoryEl.includedByRegular = true;
				}

				accu.push(subcategoryEl);
				return accu;
			},
			[],
		);

		return [...accu, categoryEl, ...subcategorized];
	}, []);
	return result;
};

export function getAppNameFromCredType(name: string) {
	return name
		.split(' ')
		.filter((word) => !CRED_KEYWORDS_TO_FILTER.includes(word))
		.join(' ');
}

export function getAppNameFromNodeName(name: string) {
	return name
		.split(' ')
		.filter((word) => !NODE_KEYWORDS_TO_FILTER.includes(word))
		.join(' ');
}

export function getTriggerNodeServiceName(nodeType: INodeTypeDescription): string {
	return nodeType.displayName.replace(/ trigger/i, '');
}

export function getActivatableTriggerNodes(nodes: INodeUi[]) {
	return nodes.filter(
		(node: INodeUi) => !node.disabled && !NON_ACTIVATABLE_TRIGGER_NODE_TYPES.includes(node.type),
	);
}

export function filterTemplateNodes(nodes: ITemplatesNode[]) {
	const notCoreNodes = nodes.filter((node: ITemplatesNode) => {
		return !(node.categories || []).some((category) => category.name === CORE_NODES_CATEGORY);
	});

	const results = notCoreNodes.length > 0 ? notCoreNodes : nodes;
	return results.filter((elem) => !TEMPLATES_NODES_FILTER.includes(elem.name));
}

export function isCommunityPackageName(packageName: string): boolean {
	COMMUNITY_PACKAGE_NAME_REGEX.lastIndex = 0;
	// Community packages names start with <@username/>n8n-nodes- not followed by word 'base'
	const nameMatch = COMMUNITY_PACKAGE_NAME_REGEX.exec(packageName);

	return !!nameMatch;
}

export function hasExpressionMapping(value: unknown) {
	return typeof value === 'string' && !!MAPPING_PARAMS.find((param) => value.includes(param));
}

export function isValueExpression(
	parameter: INodeProperties,
	paramValue: NodeParameterValueType,
): boolean {
	if (parameter.noDataExpression === true) {
		return false;
	}
	if (typeof paramValue === 'string' && paramValue.charAt(0) === '=') {
		return true;
	}
	if (
		isResourceLocatorValue(paramValue) &&
		paramValue.value &&
		paramValue.value.toString().charAt(0) === '='
	) {
		return true;
	}
	return false;
}

export const executionDataToJson = (inputData: INodeExecutionData[]): IDataObject[] =>
	inputData.reduce<IDataObject[]>(
		(acc, item) => (isJsonKeyObject(item) ? acc.concat(item.json) : acc),
		[],
	);

export const matchesSelectType = (el: INodeCreateElement, selectedType: string) => {
	if (selectedType === REGULAR_NODE_FILTER && el.includedByRegular) {
		return true;
	}
	if (selectedType === TRIGGER_NODE_FILTER && el.includedByTrigger) {
		return true;
	}

	return selectedType === ALL_NODE_FILTER;
};

const matchesAlias = (nodeType: INodeTypeDescription, filter: string): boolean => {
	if (!nodeType.codex || !nodeType.codex.alias) {
		return false;
	}

	return nodeType.codex.alias.reduce((accu: boolean, alias: string) => {
		return accu || alias.toLowerCase().indexOf(filter) > -1;
	}, false);
};

export const matchesNodeType = (el: INodeCreateElement, filter: string) => {
	const nodeType = (el.properties as INodeItemProps).nodeType;

	return (
		nodeType.displayName.toLowerCase().indexOf(filter) !== -1 || matchesAlias(nodeType, filter)
	);
};

export const hasOnlyListMode = (parameter: INodeProperties): boolean => {
	return (
		parameter.modes !== undefined &&
		parameter.modes.length === 1 &&
		parameter.modes[0].name === 'list'
	);
};

// Gets all authentication types that a given node type supports
export const getNodeAuthOptions = (
	nodeType: INodeTypeDescription | null,
): NodeAuthenticationOption[] => {
	if (nodeType) {
		let options: NodeAuthenticationOption[] = [];
		const authProp = getMainAuthField(nodeType);
		if (authProp && authProp.options) {
			options = options.concat(
				authProp.options.map((option) => ({
					name: option.name,
					value: option.value,
					// Also add in the display options so we can hide/show the option if necessary
					displayOptions: authProp.displayOptions,
				})) || [],
			);
		}
		return options;
	}
	return [];
};

// TODO: Need a better way to find which auth field is main
// for now taking only the first one
export const getMainAuthField = (nodeType?: INodeTypeDescription): INodeProperties | null => {
	if (!nodeType) {
		return null;
	}
	const authProps = getNodeAuthFields(nodeType);
	// Resource is not an auth field but some nodes use it to filter credentials
	if (authProps.length > 0 && authProps[0].name !== 'resource') {
		return authProps[0];
	}
	return null;
}

export const getNodeCredentialForAuthType = (
	nodeType: INodeTypeDescription,
	authType: string,
): INodeCredentialDescription | null => {
	const authField = getMainAuthField(nodeType);
	const authFieldName = authField ? authField.name : '';
	return (
		nodeType.credentials?.find(
			(cred) =>
				cred.displayOptions?.show && cred.displayOptions.show[authFieldName]?.includes(authType),
		) || null
	);
};

export const getAuthTypeForNodeCredential = (
	nodeType: INodeTypeDescription | null,
	credentialType: INodeCredentialDescription | null,
): INodePropertyOptions | INodeProperties | INodePropertyCollection | null => {
	if (nodeType && credentialType) {
		const authField = getMainAuthField(nodeType);
		const authFieldName = authField ? authField.name : '';
		const nodeAuthOptions = getNodeAuthOptions(nodeType);
		return (
			nodeAuthOptions.find(
				(option) =>
					credentialType.displayOptions?.show &&
					credentialType.displayOptions?.show[authFieldName]?.includes(option.value),
			) || null
		);
	}
	return null;
};

export const isAuthRelatedParameter = (
	authFields: INodeProperties[],
	parameter: INodeProperties,
): boolean => {
	let isRelated = false;
	authFields.forEach((prop) => {
		if (
			prop.displayOptions &&
			prop.displayOptions.show &&
			parameter.name in prop.displayOptions.show
		) {
			isRelated = true;
			return;
		}
	});
	return isRelated;
};

export const getNodeAuthFields = (nodeType: INodeTypeDescription | null): INodeProperties[] => {
	const authFields: INodeProperties[] = [];
	if (nodeType && nodeType.credentials && nodeType.credentials.length > 0) {
		nodeType.credentials.forEach((cred) => {
			if (cred.displayOptions && cred.displayOptions.show) {
				Object.keys(cred.displayOptions.show).forEach((option) => {
					const nodeFieldForName = nodeType.properties.find((prop) => prop.name === option);
					if (nodeFieldForName && !authFields.find((f) => f.name === option)) {
						authFields.push(nodeFieldForName);
					}
				});
			}
		});
	}
	return authFields;
};
