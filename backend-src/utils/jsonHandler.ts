/**
 * Safe JSON parsing utilities for handling JSONB fields
 */

/**
 * Safely parse a value that might be JSON string or already an object
 * @param value The value to parse
 * @returns The parsed object or undefined if parsing fails
 */
export function safeJsonParse<T = any>(value: any): T | undefined {
  if (!value) {
    return undefined;
  }
  
  // If it's already an object, return it
  if (typeof value === 'object') {
    return value as T;
  }
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Failed to parse JSON string:', error);
      console.error('Value was:', value);
      return undefined;
    }
  }
  
  // For any other type, return undefined
  return undefined;
}

/**
 * Ensure a value is properly formatted for JSONB storage
 * @param value The value to format
 * @returns The value ready for JSONB storage
 */
export function prepareForJsonb(value: any): any {
  if (!value) {
    return null;
  }
  
  // If it's already an object, return it
  if (typeof value === 'object') {
    return value;
  }
  
  // If it's a string that looks like JSON, parse it
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Failed to parse JSON string for JSONB:', error);
      return null;
    }
  }
  
  // For any other type, return null
  return null;
}