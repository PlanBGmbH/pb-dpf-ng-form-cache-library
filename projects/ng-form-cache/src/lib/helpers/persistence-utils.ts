import { FormGroup } from '@angular/forms';

/**
 * Serializes the form data to a JSON string.
 * @param form The form to serialize.
 * @returns A JSON string representing the form data.
 */
export function serializeForm(form: FormGroup) {
	return JSON.stringify(form.getRawValue());
}

/**
 * Deserializes the JSON string and patches the form.
 * @param json The JSON string to deserialize.
 * @param form The form to patch.
 */
export function deserializeForm(json: string, form: FormGroup) {
	try {
		const data = JSON.parse(json);
		form.patchValue(data);
	} catch (error) {
		console.error('Error deserializing form data', error);
	}
}
